import { Make, Mutex } from "@nivinjoseph/n-util";
import { given } from "@nivinjoseph/n-defensive";
import * as Redis from "redis";
import { EdaEvent } from "../eda-event";
import { Logger } from "@nivinjoseph/n-log";
import * as Zlib from "zlib";


export class Producer
{
    private readonly _edaPrefix = "n-eda";
    private readonly _client: Redis.RedisClient;
    private readonly _logger: Logger;
    private readonly _topic: string;
    private readonly _ttlMinutes: number;
    private readonly _partition: number;
    private readonly _compress: boolean;
    private readonly _mutex = new Mutex();
    
    
    public constructor(client: Redis.RedisClient, logger: Logger, topic: string, ttlMinutes: number,
        partition: number, compress: boolean)
    {
        given(client, "client").ensureHasValue().ensureIsObject();
        this._client = client;
        
        given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;

        given(topic, "topic").ensureHasValue().ensureIsString();
        this._topic = topic;
        
        given(ttlMinutes, "ttlMinutes").ensureHasValue().ensureIsNumber();
        this._ttlMinutes = ttlMinutes;

        given(partition, "partition").ensureHasValue().ensureIsNumber();
        this._partition = partition;
        
        given(compress, "compress").ensureHasValue().ensureIsBoolean();
        this._compress = compress;
    }
    
    
    // public async produce(event: EdaEvent): Promise<void>
    // {
    //     given(event, "event").ensureHasValue().ensureIsObject()
    //         .ensureHasStructure({
    //             id: "string",
    //             name: "string"
    //         }); 

    //     const writeIndex = await this.acquireWriteIndex();    
        
    //     const compressedEvent = await this.compressEvent(event.serialize());

    //     await Make.retryWithDelay(async () =>
    //     {
    //         try 
    //         {
    //             await this.storeEvent(writeIndex, compressedEvent);
    //         }
    //         catch (error)
    //         {
    //             await this._logger.logWarning(`Error while storing event of type ${event.name} => Topic: ${this._topic}; Partition: ${this._partition}; WriteIndex: ${writeIndex};`);
    //             await this._logger.logError(error);
    //             throw error;
    //         }

    //     }, 20, 1000)();
    // }
    
    public async produce(...events: ReadonlyArray<EdaEvent>): Promise<void>
    {
        given(events, "events").ensureHasValue().ensureIsArray();
        if (events.isEmpty)
            return;

        const upperBoundWriteIndex = await this.acquireWriteIndex(events.length);
        const lowerBoundWriteIndex = upperBoundWriteIndex - events.length;
        
        const indexed = new Array<{ index: number; event: EdaEvent }>();
        
        for (let i = 0; i < events.length; i++)
        {
            const event = events[i];
            const writeIndex = lowerBoundWriteIndex + i + 1;
            indexed.push({ index: writeIndex, event });
        }
        
        await indexed.forEachAsync(async (t) =>
        {
            const compressed = await this.compressEvent((t.event as EdaEvent).serialize());
                
            await Make.retryWithDelay(async () =>
            {
                try 
                {
                    await this.storeEvent(t.index, compressed);
                }
                catch (error)
                {
                    await this._logger.logWarning(`Error while storing event of type ${t.event.name} => Topic: ${this._topic}; Partition: ${this._partition}; WriteIndex: ${t.index};`);
                    await this._logger.logError(error);
                    throw error;
                }
            }, 20, 1000)();
        });
    }
    
    private async compressEvent(event: object): Promise<string>
    {
        given(event, "event").ensureHasValue().ensureIsObject();
        
        if (!this._compress)
            return JSON.stringify(event);

        const compressed = await Make.callbackToPromise<Buffer>(Zlib.brotliCompress)(Buffer.from(JSON.stringify(event), "utf8"),
            { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } });

        return compressed.toString("base64");
    }
    
    private async acquireWriteIndex(incrBy: number): Promise<number>
    {
        await this._mutex.lock();

        try
        {
            return await Make.retryWithDelay(async () =>
            {
                try 
                {
                    return await this.incrementPartitionWriteIndex(incrBy);
                }
                catch (error)
                {
                    await this._logger.logWarning(`Error while incrementing partition write index => Topic: ${this._topic}; Partition: ${this._partition};`);
                    await this._logger.logError(error);
                    throw error;
                }

            }, 20, 1000)();
        }
        finally
        {
            this._mutex.release();
        }
    }

    private incrementPartitionWriteIndex(incrBy: number): Promise<number>
    {
        return new Promise((resolve, reject) =>
        {
            given(incrBy, "incrBy").ensureHasValue().ensureIsNumber().ensure(t => t > 0, "has to be > 0");
            
            const key = `${this._edaPrefix}-${this._topic}-${this._partition}-write-index`;

            this._client.incrby(key, incrBy, (err, val) =>
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

    private storeEvent(writeIndex: number, eventData: string): Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
            given(writeIndex, "writeIndex").ensureHasValue().ensureIsNumber();
            given(eventData, "eventData").ensureHasValue().ensureIsString();

            const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${writeIndex}`;
            // const expirySeconds = 60 * 60 * 4;
            const expirySeconds = this._ttlMinutes * 60;

            this._client.setex(key.trim(), expirySeconds, eventData, (err) =>
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
    
    // private storeEvents(indexedEvents: ReadonlyArray<{ index: number; event: string}>): Promise<void>
    // {
    //     return new Promise((resolve, reject) =>
    //     {
    //         // given(writeIndex, "writeIndex").ensureHasValue().ensureIsNumber();
    //         // given(eventData, "eventData").ensureHasValue().ensureIsString();
            
    //         const expirySeconds = this._ttlMinutes * 60;
                    
    //         const data = indexedEvents.reduce((acc, t) =>
    //         {
    //             const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${t.index}`;
    //             acc.push(key);
    //             acc.push(t.event);
    //             return acc;
    //         }, new Array<string>());
            
    //         this._client.mset(...data, )
            

    //         // const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${writeIndex}`;
    //         // const expirySeconds = 60 * 60 * 4;
            

    //         this._client.setex(key.trim(), expirySeconds, eventData, (err) =>
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
}