import { Disposable, Delay, Make, Deserializer } from "@nivinjoseph/n-util";
import { given } from "@nivinjoseph/n-defensive";
import * as Redis from "redis";
import { EdaManager } from "../eda-manager";
import { EventRegistration } from "../event-registration";
import { EdaEvent } from "../eda-event";
import { Logger } from "@nivinjoseph/n-log";
import { ObjectDisposedException, ApplicationException } from "@nivinjoseph/n-exception";
import * as Zlib from "zlib";
import { Broker } from "./broker";


export class Consumer implements Disposable
{
    private readonly _edaPrefix = "n-eda";
    private readonly _defaultDelayMS = 150;
    private readonly _client: Redis.RedisClient;
    private readonly _manager: EdaManager;
    private readonly _logger: Logger;
    private readonly _topic: string;
    private readonly _partition: number;
    private readonly _id: string;
    private readonly _cleanKeys: boolean;
    
    private _isDisposed = false;
    private _trackedIdsSet = new Set<string>();
    private _trackedIdsArray = new Array<string>();
    private _trackedKeysArray = new Array<string>();
    private _consumePromise: Promise<void> | null = null;
    private _broker: Broker = null as any;
    
    
    protected get manager(): EdaManager { return this._manager; }
    protected get topic(): string { return this._topic; }
    protected get partition(): number { return this._partition; }
    protected get logger(): Logger { return this._logger; }
    protected get trackedIdsSet(): ReadonlySet<string> { return this._trackedIdsSet; }
    protected get isDisposed(): boolean { return this._isDisposed; }
    
    public get id(): string { return this._id; }
    
    
    public constructor(client: Redis.RedisClient, manager: EdaManager, topic: string, partition: number)
    {
        given(client, "client").ensureHasValue().ensureIsObject();
        this._client = client;
        
        given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(EdaManager);
        this._manager = manager;
        
        this._logger = this._manager.serviceLocator.resolve<Logger>("Logger");
        
        given(topic, "topic").ensureHasValue().ensureIsString();
        this._topic = topic;
        
        given(partition, "partition").ensureHasValue().ensureIsNumber();
        this._partition = partition;
        
        this._id = `${this._topic}-${this._partition}`;
        
        this._cleanKeys = this._manager.cleanKeys;
    }
    
    
    public registerBroker(broker: Broker): void
    {
        given(broker, "broker").ensureHasValue().ensureIsObject().ensureIsObject().ensureIsType(Broker);
        this._broker = broker;
    }
    
    public consume(): void
    {
        if (this._isDisposed)
            throw new ObjectDisposedException(this);
        
        given(this, "this").ensure(t => !t._consumePromise, "consumption has already commenced");
        
        this._consumePromise = this.beginConsume();
    }
    
    public dispose(): Promise<void>
    {
        if (!this._isDisposed)
            this._isDisposed = true;
        
        return this._consumePromise || Promise.resolve();
    }
    
    protected async beginConsume(): Promise<void>
    {
        while (true)
        {
            if (this.isDisposed)
                return;

            try 
            {
                const writeIndex = await this.fetchPartitionWriteIndex();
                const readIndex = await this.fetchConsumerPartitionReadIndex();
                

                if (readIndex >= writeIndex)
                {
                    await Delay.milliseconds(this._defaultDelayMS);
                    continue;
                }

                const maxRead = 50;
                const lowerBoundReadIndex = readIndex + 1;
                const upperBoundReadIndex = (writeIndex - readIndex) > maxRead ? (readIndex + maxRead - 1) : writeIndex;
                const eventsData = await this.batchRetrieveEvents(lowerBoundReadIndex, upperBoundReadIndex);
                
                const routed = new Array<Promise<void>>();
                
                for (const item of eventsData)
                {
                    if (this.isDisposed)
                        return;
                    
                    let eventData = item.value;
                    let numReadAttempts = 1;
                    const maxReadAttempts = 500; // the math here must correlate with the write attempts of the producer
                    while (eventData == null && numReadAttempts < maxReadAttempts) // we need to do this to deal with race condition
                    {
                        if (this.isDisposed)
                            return;
                        
                        await Delay.milliseconds(20);
                        
                        eventData = await this.retrieveEvent(item.key);
                        numReadAttempts++;
                    }

                    if (eventData == null)
                    {
                        try 
                        {
                            throw new ApplicationException(`Failed to read event data after ${maxReadAttempts} read attempts => Topic=${this.topic}; Partition=${this.partition}; ReadIndex=${item.index};`);
                        }
                        catch (error)
                        {
                            await this.logger.logError(error);
                        }

                        await this.incrementConsumerPartitionReadIndex();
                        continue;
                    }

                    const event = await this.decompressEvent(eventData);
                    const eventId = (<any>event).$id || (<any>event).id; // for compatibility with n-domain DomainEvent
                    const eventName = (<any>event).$name || (<any>event).name; // for compatibility with n-domain DomainEvent
                    const eventRegistration = this.manager.eventMap.get(eventName) as EventRegistration;
                    // const deserializedEvent = (<any>eventRegistration.eventType).deserializeEvent(event);
                    const deserializedEvent = Deserializer.deserialize(event) as EdaEvent;

                    if (this.trackedIdsSet.has(eventId))
                    {
                        await this.incrementConsumerPartitionReadIndex();    
                        continue;
                    }

                    routed.push(
                        this.attemptRoute(
                            eventName, eventRegistration, item.index, item.key, eventId, deserializedEvent));
                }
                
                await Promise.all(routed);
                
                if (this.isDisposed)
                    return; // TODO: probably throw error here?
                
                await this.incrementConsumerPartitionReadIndex(upperBoundReadIndex);
            }
            catch (error)
            {
                await this.logger.logWarning(`Error in consumer => ConsumerGroupId: ${this.manager.consumerGroupId}; Topic: ${this.topic}; Partition: ${this.partition};`);
                await this.logger.logError(error);
                if (this.isDisposed)
                    return;
                await Delay.seconds(5);
            }
        }
    }
    
    private async attemptRoute(eventName: string, eventRegistration: EventRegistration,
        eventIndex: number, eventKey: string, eventId: string, event: EdaEvent): Promise<void>
    {
        let failed = false;
        try 
        {
            await this._broker.route(this._id, this._topic, this._partition, eventName, eventRegistration, eventIndex, eventKey, eventId, event);
        }
        catch (error)
        {
            failed = true;
            await this.logger.logWarning(`Failed to consume event of type '${eventName}' with data ${JSON.stringify(event)}`);
            await this.logger.logError(error);
        }
        finally
        {
            if (failed && this.isDisposed)
                return;

            await this.track(eventId, eventKey);
        }
    }
    
    protected fetchPartitionWriteIndex(): Promise<number>
    {
        const key = `${this._edaPrefix}-${this._topic}-${this._partition}-write-index`;
        
        return new Promise((resolve, reject) =>
        {
            this._client.get(key, (err, value) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                resolve(value != null ? JSON.parse(value) : 0);
            });
        });
    }
    
    protected fetchConsumerPartitionReadIndex(): Promise<number>
    {
        const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${this._manager.consumerGroupId}-read-index`;
        
        return new Promise((resolve, reject) =>
        {
            this._client.get(key, (err, value) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                resolve(value != null ? JSON.parse(value) : 0);
            });
        });
    }
    
    protected incrementConsumerPartitionReadIndex(index?: number): Promise<void>
    {
        const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${this._manager.consumerGroupId}-read-index`;
        
        if (index != null)
        {
            return new Promise((resolve, reject) =>
            {
                this._client.set(key, index.toString(), (err) =>
                {
                    if (err)
                    {
                        reject(err);
                        return;
                    }

                    resolve();
                });
            });
        }        
        
        return new Promise((resolve, reject) =>
        {
            this._client.incr(key, (err) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                resolve();
            });
        });
    }
    
    protected retrieveEvent(key: string): Promise<Buffer>
    {
        return new Promise((resolve, reject) =>
        {
            // const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${indexToRead}`;
            
            this._client.get(key, (err, value) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                resolve(value as unknown as Buffer);
            });
        });
    }
    
    protected batchRetrieveEvents(lowerBoundIndex: number, upperBoundIndex: number)
        : Promise<Array<{ index: number; key: string; value: Buffer }>>
    {
        return new Promise((resolve, reject) =>
        {
            // given(lowerBoundIndex, "lowerBoundIndex").ensureHasValue().ensureIsNumber();
            // given(upperBoundIndex, "upperBoundIndex").ensureHasValue().ensureIsNumber();
            
            const keys = new Array<{ index: number; key: string; }>();
            for (let i = lowerBoundIndex; i <= upperBoundIndex; i++)
            {
                const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${i}`;
                keys.push({index: i, key});
            }
            
            this._client.mget(...keys.map(t => t.key), (err, values) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }
                
                const result = values.map((t, index) => ({
                    index: keys[index].index,
                    key: keys[index].key,
                    value: t as unknown as Buffer
                }));
                
                resolve(result);
            });
        });
    }
    
    
    
    private async track(eventId: string, eventKey: string): Promise<void>
    {
        // given(eventId, "eventId").ensureHasValue().ensureIsString();
        // given(eventKey, "eventKey").ensureHasValue().ensureIsString();
        
        if (this._trackedIdsArray.length >= 300)
        {
            this._trackedIdsArray = this._trackedIdsArray.skip(200);
            this._trackedIdsSet = new Set<string>(this._trackedIdsArray);
            
            if (this._cleanKeys)
            {
                const erasedKeys = this._trackedKeysArray.take(200);
                this._trackedKeysArray = this._trackedKeysArray.skip(200);
                await this.removeKeys(erasedKeys);
            }
        }
        
        this._trackedIdsArray.push(eventId);
        this._trackedIdsSet.add(eventId);
        
        if (this._cleanKeys)
            this._trackedKeysArray.push(eventKey);
    }
    
    private async decompressEvent(eventData: Buffer): Promise<object>
    {
        // given(eventData, "eventData").ensureHasValue();
        
        const decompressed = await Make.callbackToPromise<Buffer>(Zlib.brotliDecompress)(eventData,
            { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } });

        return JSON.parse(decompressed.toString("utf8"));
    }
    
    private async removeKeys(keys: string[]): Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
            // const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${indexToRead}`;

            this._client.unlink(...keys, (err) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                resolve();
            });
        });
    }
}