import { Disposable, Delay, Make, Deserializer } from "@nivinjoseph/n-util";
import { given } from "@nivinjoseph/n-defensive";
import * as Redis from "redis";
import { EdaManager } from "../eda-manager";
import { EventRegistration } from "../event-registration";
import { EdaEventHandler } from "../eda-event-handler";
import { EdaEvent } from "../eda-event";
import { ServiceLocator } from "@nivinjoseph/n-ject";
import { Logger } from "@nivinjoseph/n-log";
import { ObjectDisposedException, ApplicationException } from "@nivinjoseph/n-exception";
import * as Zlib from "zlib";


export class Consumer implements Disposable
{
    private readonly _edaPrefix = "n-eda";
    private readonly _defaultDelayMS = 20;
    private readonly _client: Redis.RedisClient;
    private readonly _manager: EdaManager;
    private readonly _logger: Logger;
    private readonly _topic: string;
    private readonly _partition: number;
    private readonly _onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void;
    
    private _isDisposed = false;
    private _trackedIdsSet = new Set<string>();
    private _trackedIdsArray = new Array<string>();
    private _consumePromise: Promise<void> | null = null;
    
    
    protected get manager(): EdaManager { return this._manager; }
    protected get topic(): string { return this._topic; }
    protected get partition(): number { return this._partition; }
    protected get logger(): Logger { return this._logger; }
    protected get trackedIdsSet(): ReadonlySet<string> { return this._trackedIdsSet; }
    protected get isDisposed(): boolean { return this._isDisposed; }
    
    
    public constructor(client: Redis.RedisClient, manager: EdaManager, topic: string, partition: number,
        onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void)
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
        
        given(onEventReceived, "onEventReceived").ensureHasValue().ensureIsFunction();
        this._onEventReceived = onEventReceived;
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
                        
                        await Delay.milliseconds(this._defaultDelayMS);
                        
                        eventData = await this.retrieveEvent(item.index);
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
                    const deserializedEvent = Deserializer.deserialize(event);

                    if (this.trackedIdsSet.has(eventId))
                    {
                        await this.incrementConsumerPartitionReadIndex();    
                        continue;
                    }

                    let failed = false;
                    try 
                    {
                        const maxProcessAttempts = 10;
                        let numProcessAttempts = 0;
                        let successful = false;
                        while (successful === false && numProcessAttempts < maxProcessAttempts)
                        {
                            if (this.isDisposed)
                            {
                                failed = true;
                                break;
                            }
                            
                            numProcessAttempts++;
                            
                            try 
                            {
                                await this.processEvent(eventName, eventRegistration, deserializedEvent, eventId, numProcessAttempts);
                                successful = true;
                            }
                            catch (error)
                            {
                                if (numProcessAttempts >= maxProcessAttempts)
                                    throw error;
                                else
                                    await Delay.milliseconds(100 * numProcessAttempts);
                            }
                        }
                        
                        // await Make.retryWithExponentialBackoff(async () =>
                        // {
                        //     if (this.isDisposed)
                        //     {
                        //         failed = true;
                        //         return;
                        //     }
                            
                        //     await this.processEvent(eventName, eventRegistration, deserializedEvent, eventId);
                        // }, 5)();
                    }
                    catch (error)
                    {
                        failed = true;
                        await this.logger.logWarning(`Failed to process event of type '${eventName}' with data ${JSON.stringify(event)} after 5 attempts.`);
                        await this.logger.logError(error);
                    }
                    finally
                    {
                        if (failed && this.isDisposed)
                            return;
                        
                        this.track(eventId);
                        await this.incrementConsumerPartitionReadIndex();
                    }
                }
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
    
    protected incrementConsumerPartitionReadIndex(): Promise<number>
    {
        const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${this._manager.consumerGroupId}-read-index`;
        
        return new Promise((resolve, reject) =>
        {
            this._client.incr(key, (err, val) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                resolve(val);
            });
        });
    }
    
    protected retrieveEvent(indexToRead: number): Promise<Buffer>
    {
        return new Promise((resolve, reject) =>
        {
            const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${indexToRead}`;
            
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
            given(lowerBoundIndex, "lowerBoundIndex").ensureHasValue().ensureIsNumber();
            given(upperBoundIndex, "upperBoundIndex").ensureHasValue().ensureIsNumber();
            
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
    
    protected async processEvent(eventName: string, eventRegistration: EventRegistration, event: any, eventId: string, numAttempt: number): Promise<void>
    {
        const scope = this._manager.serviceLocator.createScope();
        event.$scope = scope;

        this._onEventReceived(scope, this._topic, event);

        const handler = scope.resolve<EdaEventHandler<EdaEvent>>(eventRegistration.eventHandlerTypeName);

        try 
        {
            await handler.handle(event);
            
            await this._logger.logInfo(`Executed EventHandler '${eventRegistration.eventHandlerTypeName}' for event '${eventName}' with id '${eventId}' => ConsumerGroupId: ${this.manager.consumerGroupId}; Topic: ${this.topic}; Partition: ${this.partition};`);
        }
        catch (error)
        {
            await this._logger.logWarning(`Error in EventHandler while handling event of type '${eventName}' (ATTEMPT = ${numAttempt}) with data ${JSON.stringify((event as EdaEvent).serialize())}.`);
            await this._logger.logWarning(error);
            throw error;
        }
        finally
        {
            await scope.dispose();
        }   
    }
    
    protected track(eventId: string): void
    {
        given(eventId, "eventId").ensureHasValue().ensureIsString();
        
        if (this._trackedIdsArray.length >= 300)
        {
            this._trackedIdsArray = this._trackedIdsArray.skip(200);
            this._trackedIdsSet = new Set<string>(this._trackedIdsArray);
        }
        
        this._trackedIdsArray.push(eventId);
        this._trackedIdsSet.add(eventId);
    }
    
    protected async decompressEvent(eventData: Buffer): Promise<object>
    {
        given(eventData, "eventData").ensureHasValue();
        
        const decompressed = await Make.callbackToPromise<Buffer>(Zlib.brotliDecompress)(eventData,
            { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } });

        return JSON.parse(decompressed.toString("utf8"));
    }
}