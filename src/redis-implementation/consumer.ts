import { Disposable, Delay, Deserializer, Make } from "@nivinjoseph/n-util";
import { given } from "@nivinjoseph/n-defensive";
// import * as Redis from "redis";
import Redis from "ioredis";
import { EdaManager } from "../eda-manager";
import { EventRegistration } from "../event-registration";
import { EdaEvent } from "../eda-event";
import { Logger } from "@nivinjoseph/n-log";
import { ObjectDisposedException, ApplicationException, Exception } from "@nivinjoseph/n-exception";
import * as Zlib from "zlib";
import { Broker } from "./broker";
// import * as MessagePack from "msgpackr";
// import * as Snappy from "snappy";


export class Consumer implements Disposable
{
    private readonly _edaPrefix = "n-eda";
    private readonly _defaultDelayMS = 100;
    private readonly _client: Redis;
    private readonly _manager: EdaManager;
    private readonly _logger: Logger;
    private readonly _topic: string;
    private readonly _partition: number;
    private readonly _id: string;
    private readonly _cleanKeys: boolean;
    private readonly _trackedKeysKey: string;
    private readonly _flush: boolean;
    
    private _isDisposed = false;
    private readonly _maxTrackedSize = 3000;
    private readonly _keepTrackedSize = 1000;
    private _trackedKeysArray = new Array<string>();
    private _trackedKeysSet = new Set<string>();
    private _keysToTrack = new Array<string>();
    
    private _consumePromise: Promise<void> | null = null;
    private _broker: Broker = null as any;
    
    
    public get id(): string { return this._id; }
    
    
    public constructor(client: Redis, manager: EdaManager, topic: string, partition: number, flush = false)
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
        
        this._trackedKeysKey = `{${this._edaPrefix}-${this._topic}-${this._partition}}-tracked_keys`;
        
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
        
        // eslint-disable-next-line no-constant-condition
        while (true)
        {
            if (this._isDisposed)
                return;

            try 
            {
                // const writeIndex = await this._fetchPartitionWriteIndex();
                // const readIndex = await this._fetchConsumerPartitionReadIndex();
                
                const [writeIndex, readIndex] = await this._fetchPartitionWriteAndConsumerPartitionReadIndexes();
                
                if (readIndex >= writeIndex)
                {
                    await Delay.milliseconds(this._defaultDelayMS);
                    continue;
                }

                const maxRead = 50;
                const depth = writeIndex - readIndex;
                const lowerBoundReadIndex = readIndex + 1;
                let upperBoundReadIndex = writeIndex;
                if (depth > maxRead)
                {
                    upperBoundReadIndex = readIndex + maxRead - 1;
                    await this._logger.logWarning(`Event queue depth for ${this.id} is ${depth}.`);
                }
                
                const eventsData = await this._batchRetrieveEvents(lowerBoundReadIndex, upperBoundReadIndex);
                
                if (this._flush)
                {
                    await this._incrementConsumerPartitionReadIndex(upperBoundReadIndex);
                    await this._removeKeys(eventsData.map(t => t.key));
                    continue;
                }
                
                const routed = new Array<Promise<void>>();
                const eventDataKeys = new Array<string>();
                
                for (const item of eventsData)
                {
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    if (this._isDisposed)
                        return;
                    
                    let eventData = item.value;
                    if (this._cleanKeys)
                        eventDataKeys.push(item.key);
                    let numReadAttempts = 1;
                    
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    while (eventData == null && numReadAttempts < maxReadAttempts) // we need to do this to deal with race condition
                    {
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                        if (this._isDisposed)
                            return;
                        
                        await Delay.milliseconds(100);
                        
                        eventData = await this._retrieveEvent(item.key);
                        numReadAttempts++;
                    }

                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    if (eventData == null)
                    {
                        try 
                        {
                            throw new ApplicationException(`Failed to read event data after ${maxReadAttempts} read attempts => Topic=${this._topic}; Partition=${this._partition}; ReadIndex=${item.index};`);
                        }
                        catch (error)
                        {
                            await this._logger.logError(error as Exception);
                        }

                        await this._incrementConsumerPartitionReadIndex();
                        continue;
                    }

                    const events = await this._decompressEvents(eventData);
                    for (const event of events)
                    {
                        const eventId = (<any>event).$id || (<any>event).id; // for compatibility with n-domain DomainEvent
                        if (this._trackedKeysSet.has(eventId))
                            continue;
                        
                        const eventName = (<any>event).$name || (<any>event).name; // for compatibility with n-domain DomainEvent
                        const eventRegistration = this._manager.eventMap.get(eventName) as EventRegistration;
                        const deserializedEvent = Deserializer.deserialize<EdaEvent>(event);

                        routed.push(
                            this._attemptRoute(
                                eventName, eventRegistration, item.index, item.key, eventId, deserializedEvent));    
                    }
                }
                
                await Promise.all(routed);
                
                await this._saveTrackedKeys();
                
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (this._isDisposed)
                    return;
                
                await this._incrementConsumerPartitionReadIndex(upperBoundReadIndex);
                if (this._cleanKeys)
                    await this._removeKeys(eventDataKeys);
            }
            catch (error)
            {
                await this._logger.logWarning(`Error in consumer => ConsumerGroupId: ${this._manager.consumerGroupId}; Topic: ${this._topic}; Partition: ${this._partition};`);
                await this._logger.logError(error as Exception);
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (this._isDisposed)
                    return;
                await Delay.seconds(5);
            }
        }
    }
    
    private async _attemptRoute(eventName: string, eventRegistration: EventRegistration,
        eventIndex: number, eventKey: string, eventId: string, event: EdaEvent): Promise<void>
    {
        let brokerDisposed = false;
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
            if (error instanceof ObjectDisposedException)
                brokerDisposed = true;
            // await this._logger.logWarning(`Failed to consume event of type '${eventName}' with data ${JSON.stringify(event.serialize())}`);
            // await this._logger.logError(error as Exception);
        }
        finally
        {
            // if (failed && this._isDisposed) // cuz it could have failed because things were disposed
            //     // eslint-disable-next-line no-unsafe-finally
            //     return;

            if (!brokerDisposed)
                this._track(eventId);
        }
    }
    
    // private _fetchPartitionWriteIndex(): Promise<number>
    // {
    //     const key = `${this._edaPrefix}-${this._topic}-${this._partition}-write-index`;
        
    //     return new Promise((resolve, reject) =>
    //     {
    //         this._client.get(key, (err, value) =>
    //         {
    //             if (err)
    //             {
    //                 reject(err);
    //                 return;
    //             }
                
    //             // console.log("fetchPartitionWriteIndex", JSON.parse(value!));

    //             resolve(value != null ? JSON.parse(value) : 0);
    //         });
    //     });
    // }
    
    // private _fetchConsumerPartitionReadIndex(): Promise<number>
    // {
    //     const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${this._manager.consumerGroupId}-read-index`;
        
    //     return new Promise((resolve, reject) =>
    //     {
    //         this._client.get(key, (err, value) =>
    //         {
    //             if (err)
    //             {
    //                 reject(err);
    //                 return;
    //             }
                
    //             // console.log("fetchConsumerPartitionReadIndex", JSON.parse(value!));

    //             resolve(value != null ? JSON.parse(value) : 0);
    //         });
    //     });
    // }
    
    private _fetchPartitionWriteAndConsumerPartitionReadIndexes(): Promise<Array<number>>
    {
        const partitionWriteIndexKey = `{${this._edaPrefix}-${this._topic}-${this._partition}}-write-index`;
        const consumerPartitionReadIndexKey = `{${this._edaPrefix}-${this._topic}-${this._partition}}-${this._manager.consumerGroupId}-read-index`;
        
        return new Promise((resolve, reject) =>
        {
            this._client.mget(partitionWriteIndexKey, consumerPartitionReadIndexKey, (err, results) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }
                
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                resolve(results!.map(value => value != null ? JSON.parse(value) as number : 0));
            }).catch(e => reject(e));
        });
        
        
    }
    
    private _incrementConsumerPartitionReadIndex(index?: number): Promise<void>
    {
        const key = `{${this._edaPrefix}-${this._topic}-${this._partition}}-${this._manager.consumerGroupId}-read-index`;
        
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
                }).catch(e => reject(e));
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
            }).catch(e => reject(e));
        });
    }
    
    private _retrieveEvent(key: string): Promise<Buffer>
    {
        return new Promise((resolve, reject) =>
        {
            this._client.getBuffer(key, (err, value) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                resolve(value!);
            }).catch(e => reject(e));
        });
    }
    
    private _batchRetrieveEvents(lowerBoundIndex: number, upperBoundIndex: number)
        : Promise<Array<{ index: number; key: string; value: Buffer; }>>
    {
        return new Promise((resolve, reject) =>
        {
            const keys = new Array<{ index: number; key: string; }>();
            for (let i = lowerBoundIndex; i <= upperBoundIndex; i++)
            {
                const key = `{${this._edaPrefix}-${this._topic}-${this._partition}}-${i}`;
                keys.push({index: i, key});
            }
            
            this._client.mgetBuffer(...keys.map(t => t.key), (err, values) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }
                
                const result = values!.map((t, index) => ({
                    index: keys[index].index,
                    key: keys[index].key,
                    value: t!
                }));
                
                resolve(result);
            }).catch(e => reject(e));
        });
    }
    
    private _track(eventKey: string): void
    {
        this._trackedKeysSet.add(eventKey);
        this._trackedKeysArray.push(eventKey);
        this._keysToTrack.push(eventKey);        
    }
    
    private async _saveTrackedKeys(): Promise<void>
    {
        if (this._keysToTrack.isNotEmpty)
        {
            await new Promise<void>((resolve, reject) =>
            {
                this._client.lpush(this._trackedKeysKey, ...this._keysToTrack, (err) =>
                {
                    if (err)
                    {
                        reject(err);
                        return;
                    }

                    resolve();
                }).catch(e => reject(e));
            });
        
            this._keysToTrack = new Array<string>();
        }
        
        if (this._isDisposed)
            return;
        
        if (this._trackedKeysSet.size >= this._maxTrackedSize)
        {
            const newTracked = this._trackedKeysArray.skip(this._maxTrackedSize - this._keepTrackedSize);
            
            this._trackedKeysSet = new Set<string>(newTracked);
            this._trackedKeysArray = newTracked;
            
            await this._purgeTrackedKeys();
            
            // await Promise.all([
            //     erasedKeys.isNotEmpty ? this._removeKeys(erasedKeys) : Promise.resolve(),
            //     this._purgeTrackedKeys()
            // ]);
        }
    }
    
    
    
    // private async _track(eventKey: string): Promise<void>
    // {
    //     this._trackedKeysSet.add(eventKey);
    //     await this._saveTrackedKey(eventKey);
        
    //     if (this._trackedKeysSet.size >= 300)
    //     {
    //         const trackedKeysArray = [...this._trackedKeysSet.values()];
    //         this._trackedKeysSet = new Set<string>(trackedKeysArray.skip(200));

    //         if (this._cleanKeys)
    //         {
    //             const erasedKeys = trackedKeysArray.take(200);
    //             await this._removeKeys(erasedKeys);
    //         }
            
    //         await this._purgeTrackedKeys();
    //     }
    // }
    
    // private _saveTrackedKey(key: string): Promise<void>
    // {
    //     return new Promise((resolve, reject) =>
    //     {
    //         this._client.lpush(this._trackedKeysKey, key, (err) =>
    //         {
    //             if (err)
    //             {
    //                 reject(err);
    //                 return;
    //             }
                
    //             resolve();
    //         });
    //     });
    // }
    
    private _purgeTrackedKeys(): Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
            this._client.ltrim(this._trackedKeysKey, 0, this._keepTrackedSize - 1, (err) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                resolve();
            }).catch(e => reject(e));
        });
    }
    
    // private _purgeTrackedKeys(): void
    // {
    //     this._client.ltrim(this._trackedKeysKey, 0, 1999).catch(e => this._logger.logError(e));
    // }
    
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
                
                keys = keys!.reverse().map(t => (t as unknown as Buffer).toString("utf8"));
                
                // console.log(keys);
                
                this._trackedKeysSet = new Set<string>(keys);
                this._trackedKeysArray = keys;
                
                resolve();
            }).catch(e => reject(e));
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
    
    private async _decompressEvents(eventData: Buffer): Promise<Array<object>>
    {
        const decompressed = await Make.callbackToPromise<Buffer>(Zlib.inflateRaw)(eventData);

        return JSON.parse(decompressed.toString("utf8")) as Array<object>;
    }
    
    private async _removeKeys(keys: ReadonlyArray<string>): Promise<void>
    {
        if (keys.isEmpty)
            return;
        
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
            }).catch(e => reject(e));
        });
    }
    
    // private _removeKeys(keys: ReadonlyArray<string>): void
    // {
    //     if (keys.isEmpty)
    //         return;
            
    //     this._client.unlink(...keys).catch(e => this._logger.logError(e));
    // }
}