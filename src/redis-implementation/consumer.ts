import { Disposable, Delay, Deserializer, Make } from "@nivinjoseph/n-util";
import { given } from "@nivinjoseph/n-defensive";
import * as Redis from "redis";
import { EdaManager } from "../eda-manager";
import { EventRegistration } from "../event-registration";
import { EdaEvent } from "../eda-event";
import { Logger } from "@nivinjoseph/n-log";
import { ObjectDisposedException, ApplicationException } from "@nivinjoseph/n-exception";
import * as Zlib from "zlib";
import { Broker } from "./broker";
// import * as MessagePack from "msgpackr";
// import * as Snappy from "snappy";


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
    private readonly _trackedKeysKey: string;
    private readonly _flush: boolean;
    
    private _isDisposed = false;
    private _trackedKeysSet = new Set<string>();
    private _consumePromise: Promise<void> | null = null;
    private _broker: Broker = null as any;
    
    
    public get id(): string { return this._id; }
    
    
    public constructor(client: Redis.RedisClient, manager: EdaManager, topic: string, partition: number, flush = false)
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
        
        this._trackedKeysKey = `${this._edaPrefix}-${this._topic}-${this._partition}-tracked_keys`;
        
        given(flush, "flush").ensureHasValue().ensureIsBoolean();
        this._flush = flush;
    }
    
    
    public registerBroker(broker: Broker): void
    {
        given(broker, "broker").ensureHasValue().ensureIsObject().ensureIsObject().ensureIsType(Broker);
        this._broker = broker;
    }
    
    public consume(): void
    {
        if (this._isDisposed)
            throw new ObjectDisposedException("Consumer");
        
        given(this, "this").ensure(t => !t._consumePromise, "consumption has already commenced");
        
        this._consumePromise = this._beginConsume();
    }
    
    public async dispose(): Promise<void>
    {
        if (!this._isDisposed)
            this._isDisposed = true;
        
        return this._consumePromise || Promise.resolve();
    }
    
    private async _beginConsume(): Promise<void>
    {
        await this._loadTrackedKeys();
        await this._logger.logInfo(`Loaded tracked keys for Consumer ${this._id} => ${this._trackedKeysSet.size}`);
        
        const maxReadAttempts = 50;
        
        while (true)
        {
            if (this._isDisposed)
                return;

            try 
            {
                const writeIndex = await this._fetchPartitionWriteIndex();
                const readIndex = await this._fetchConsumerPartitionReadIndex();
                
                if (readIndex >= writeIndex)
                {
                    await Delay.milliseconds(this._defaultDelayMS);
                    continue;
                }

                const maxRead = 50;
                const lowerBoundReadIndex = readIndex + 1;
                const upperBoundReadIndex = (writeIndex - readIndex) > maxRead ? (readIndex + maxRead - 1) : writeIndex;
                const eventsData = await this._batchRetrieveEvents(lowerBoundReadIndex, upperBoundReadIndex);
                
                const routed = new Array<Promise<void>>();
                
                for (const item of eventsData)
                {
                    if (this._isDisposed)
                        return;
                    
                    if (this._trackedKeysSet.has(item.key))
                    {
                        await this._incrementConsumerPartitionReadIndex();
                        continue;
                    }
                    
                    let eventData = item.value;
                    if (eventData == null)
                    {
                        if (this._flush)
                        {
                            await this._incrementConsumerPartitionReadIndex();
                            continue;
                        }
                        
                        eventData = await this._retrieveEvent(item.key);
                    }
                    
                    let numReadAttempts = 1;
                    while (eventData == null && numReadAttempts < maxReadAttempts) // we need to do this to deal with race condition
                    {
                        if (this._isDisposed)
                            return;
                        
                        await Delay.milliseconds(100);
                        
                        eventData = await this._retrieveEvent(item.key);
                        numReadAttempts++;
                    }

                    if (eventData == null)
                    {
                        try 
                        {
                            throw new ApplicationException(`Failed to read event data after ${maxReadAttempts} read attempts => Topic=${this._topic}; Partition=${this._partition}; ReadIndex=${item.index};`);
                        }
                        catch (error)
                        {
                            await this._logger.logError(error);
                        }

                        await this._incrementConsumerPartitionReadIndex();
                        continue;
                    }

                    const event = await this._decompressEvent(eventData);
                    const eventId = (<any>event).$id || (<any>event).id; // for compatibility with n-domain DomainEvent
                    const eventName = (<any>event).$name || (<any>event).name; // for compatibility with n-domain DomainEvent
                    const eventRegistration = this._manager.eventMap.get(eventName) as EventRegistration;
                    // const deserializedEvent = (<any>eventRegistration.eventType).deserializeEvent(event);
                    const deserializedEvent = Deserializer.deserialize(event) as EdaEvent;

                    routed.push(
                        this._attemptRoute(
                            eventName, eventRegistration, item.index, item.key, eventId, deserializedEvent));
                }
                
                await Promise.all(routed);
                
                if (this._isDisposed)
                    return;
                
                await this._incrementConsumerPartitionReadIndex(upperBoundReadIndex);
            }
            catch (error)
            {
                await this._logger.logWarning(`Error in consumer => ConsumerGroupId: ${this._manager.consumerGroupId}; Topic: ${this._topic}; Partition: ${this._partition};`);
                await this._logger.logError(error);
                if (this._isDisposed)
                    return;
                await Delay.seconds(5);
            }
        }
    }
    
    private async _attemptRoute(eventName: string, eventRegistration: EventRegistration,
        eventIndex: number, eventKey: string, eventId: string, event: EdaEvent): Promise<void>
    {
        let failed = false;
        try 
        {
            await this._broker.route({
                consumerId: this._id,
                topic: this._topic,
                partition: this._partition,
                eventName,
                eventRegistration,
                eventIndex,
                eventKey,
                eventId,
                event,
                partitionKey: this._manager.partitionKeyMapper(event)
            });
        }
        catch (error)
        {
            failed = true;
            await this._logger.logWarning(`Failed to consume event of type '${eventName}' with data ${JSON.stringify(event.serialize())}`);
            await this._logger.logError(error);
        }
        finally
        {
            if (failed && this._isDisposed) // cuz it could have failed because things were disposed
                return;

            await this._track(eventKey);
        }
    }
    
    private _fetchPartitionWriteIndex(): Promise<number>
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
                
                // console.log("fetchPartitionWriteIndex", JSON.parse(value!));

                resolve(value != null ? JSON.parse(value) : 0);
            });
        });
    }
    
    private _fetchConsumerPartitionReadIndex(): Promise<number>
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
                
                // console.log("fetchConsumerPartitionReadIndex", JSON.parse(value!));

                resolve(value != null ? JSON.parse(value) : 0);
            });
        });
    }
    
    private _incrementConsumerPartitionReadIndex(index?: number): Promise<void>
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
    
    private _retrieveEvent(key: string): Promise<Buffer>
    {
        return new Promise((resolve, reject) =>
        {
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
    
    private _batchRetrieveEvents(lowerBoundIndex: number, upperBoundIndex: number)
        : Promise<Array<{ index: number; key: string; value: Buffer }>>
    {
        return new Promise((resolve, reject) =>
        {
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
    
    private async _track(eventKey: string): Promise<void>
    {
        this._trackedKeysSet.add(eventKey);
        await this._saveTrackedKey(eventKey);
        
        if (this._trackedKeysSet.size >= 300)
        {
            const trackedKeysArray = [...this._trackedKeysSet.values()];
            this._trackedKeysSet = new Set<string>(trackedKeysArray.skip(200));

            if (this._cleanKeys)
            {
                const erasedKeys = trackedKeysArray.take(200);
                await this._removeKeys(erasedKeys);
            }
            
            await this._purgeTrackedKeys();
        }
    }
    
    private _saveTrackedKey(key: string): Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
            this._client.lpush(this._trackedKeysKey, key, (err) =>
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
    
    private _purgeTrackedKeys(): Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
            this._client.ltrim(this._trackedKeysKey, 0, 300, (err) =>
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
    
    private _loadTrackedKeys(): Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
            this._client.lrange(this._trackedKeysKey, 0, -1, (err, keys) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }    
                
                keys = keys.reverse().map(t => (t as unknown as Buffer).toString("utf8"));
                
                // console.log(keys);
                
                this._trackedKeysSet = new Set<string>(keys);

                resolve();
            });
        });
    }
    
    // private async _decompressEvent(eventData: Buffer): Promise<object>
    // { 
    //     const decompressed = await Make.callbackToPromise<Buffer>(Zlib.brotliDecompress)(eventData,
    //         { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } });

    //     return JSON.parse(decompressed.toString("utf8"));
    // }
    
    // private async _decompressEvent(eventData: Buffer): Promise<object>
    // {
    //     const decompressed = await Snappy.uncompress(eventData, { asBuffer: true }) as Buffer;

    //     return MessagePack.unpack(decompressed);
    // }
    
    private async _decompressEvent(eventData: Buffer): Promise<object>
    {
        const decompressed = await Make.callbackToPromise<Buffer>(Zlib.inflateRaw)(eventData);

        return JSON.parse(decompressed.toString("utf8"));
    }
    
    private async _removeKeys(keys: string[]): Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
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