import { Make } from "@nivinjoseph/n-util";
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


    public constructor(client: Redis.RedisClient, logger: Logger, topic: string, ttlMinutes: number,
        partition: number)
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
    }

    
    public async produce(...events: ReadonlyArray<EdaEvent>): Promise<void>
    {
        given(events, "events").ensureHasValue().ensureIsArray();
        if (events.isEmpty)
            return;

        const indexed = await events.mapAsync(async (t) => ({
            event: t,
            compressed: await this._compressEvent((t).serialize())
        }));

        for (const item of indexed)
        {
            try 
            {
                const writeIndex = await Make.retryWithExponentialBackoff(() => this._incrementPartitionWriteIndex(), 5)();
                await Make.retryWithExponentialBackoff(() => this._storeEvent(writeIndex, item.compressed), 5)();
            }
            catch (error)
            {
                await this._logger.logWarning(`Error while storing event of type ${item.event.name}  => Topic: ${this._topic}; Partition: ${this._partition};`);
                await this._logger.logError(error);
                throw error;
            }
        }
    }

    private async _compressEvent(event: object): Promise<Buffer>
    {
        given(event, "event").ensureHasValue().ensureIsObject();

        const compressed = await Make.callbackToPromise<Buffer>(Zlib.brotliCompress)(Buffer.from(JSON.stringify(event), "utf8"),
            { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } });

        return compressed;
    }
    
    private _incrementPartitionWriteIndex(): Promise<number>
    {
        return new Promise((resolve, reject) =>
        {
            const key = `${this._edaPrefix}-${this._topic}-${this._partition}-write-index`;

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

    private _storeEvent(writeIndex: number, eventData: string | Buffer): Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
            given(writeIndex, "writeIndex").ensureHasValue().ensureIsNumber();
            given(eventData, "eventData").ensureHasValue();

            const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${writeIndex}`;
            // const expirySeconds = 60 * 60 * 4;
            const expirySeconds = this._ttlMinutes * 60;

            this._client.setex(key.trim(), expirySeconds, eventData as any, (err) =>
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





// export class Producer
// {
//     private readonly _edaPrefix = "n-eda";
//     private readonly _client: Redis.RedisClient;
//     private readonly _logger: Logger;
//     private readonly _topic: string;
//     private readonly _ttlMinutes: number;
//     private readonly _partition: number;
//     private readonly _mutex = new Mutex();
    
    
//     public constructor(client: Redis.RedisClient, logger: Logger, topic: string, ttlMinutes: number,
//         partition: number)
//     {
//         given(client, "client").ensureHasValue().ensureIsObject();
//         this._client = client;
        
//         given(logger, "logger").ensureHasValue().ensureIsObject();
//         this._logger = logger;

//         given(topic, "topic").ensureHasValue().ensureIsString();
//         this._topic = topic;
        
//         given(ttlMinutes, "ttlMinutes").ensureHasValue().ensureIsNumber();
//         this._ttlMinutes = ttlMinutes;

//         given(partition, "partition").ensureHasValue().ensureIsNumber();
//         this._partition = partition;
//     }
    
//     public async produce(...events: ReadonlyArray<EdaEvent>): Promise<void>
//     {
//         given(events, "events").ensureHasValue().ensureIsArray();
//         if (events.isEmpty)
//             return;

//         const indexed = await events.mapAsync(async (t) => ({
//             index: 0,
//             event: t,
//             compressed: await this.compressEvent((t).serialize())
//         }));
        
//         const upperBoundWriteIndex = await this.acquireWriteIndex(events.length);
//         const lowerBoundWriteIndex = upperBoundWriteIndex - events.length;
        
//         for (let i = 0; i < events.length; i++)
//             indexed[i].index = lowerBoundWriteIndex + i + 1;
        
//         await indexed.forEachAsync(async (t) =>
//         {
//             const maxStoreAttempts = 500; // correlates with read attempts in consumer
//             let numStoreAttempts = 0;
//             let stored = false;
            
//             while (stored === false && numStoreAttempts < maxStoreAttempts)
//             {
//                 numStoreAttempts++;
                
//                 try 
//                 {
//                     await this.storeEvent(t.index, t.compressed);
//                     stored = true;
//                 }
//                 catch (error)
//                 {
//                     await this._logger.logWarning(`Error while storing event of type ${t.event.name} (ATTEMPT = ${numStoreAttempts}) => Topic: ${this._topic}; Partition: ${this._partition}; WriteIndex: ${t.index};`);
//                     await this._logger.logError(error);
                    
//                     if (numStoreAttempts >= maxStoreAttempts)
//                         throw error;
//                     else
//                         await Delay.milliseconds(20);
//                 }
//             }
            
//             // await Make.retryWithDelay(async () =>
//             // {
//             //     try 
//             //     {
//             //         await this.storeEvent(t.index, t.compressed);
//             //     }
//             //     catch (error)
//             //     {
//             //         await this._logger.logWarning(`Error while storing event of type ${t.event.name} => Topic: ${this._topic}; Partition: ${this._partition}; WriteIndex: ${t.index};`);
//             //         await this._logger.logError(error);
//             //         throw error;
//             //     }
//             // }, 20, 500)();
//         });
//     }
    
//     private async compressEvent(event: object): Promise<Buffer>
//     {
//         given(event, "event").ensureHasValue().ensureIsObject();

//         const compressed = await Make.callbackToPromise<Buffer>(Zlib.brotliCompress)(Buffer.from(JSON.stringify(event), "utf8"),
//             { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } });

//         return compressed;
//     }
//     // @ts-ignore
//     private async acquireWriteIndex(incrBy: number): Promise<number>
//     {
//         await this._mutex.lock();

//         try
//         {
//             const maxAttempts = 20;
//             let numAttempts = 0;
            
//             while (numAttempts < maxAttempts)
//             {
//                 numAttempts++;
                
//                 try 
//                 {
//                     return await this.incrementPartitionWriteIndex(incrBy);
//                 }
//                 catch (error)
//                 {
//                     await this._logger.logWarning(`Error while incrementing partition write index (ATTEMPT = ${numAttempts}) => Topic: ${this._topic}; Partition: ${this._partition};`);
//                     await this._logger.logError(error);
                    
//                     if (numAttempts >= maxAttempts)
//                         throw error;
//                     else
//                         await Delay.milliseconds(500);
//                 }
//             }
//         }
//         finally
//         {
//             this._mutex.release();
//         }
//     }

//     private incrementPartitionWriteIndex(incrBy: number): Promise<number>
//     {
//         return new Promise((resolve, reject) =>
//         {
//             given(incrBy, "incrBy").ensureHasValue().ensureIsNumber().ensure(t => t > 0, "has to be > 0");
            
//             const key = `${this._edaPrefix}-${this._topic}-${this._partition}-write-index`;

//             this._client.incrby(key, incrBy, (err, val) =>
//             {
//                 if (err)
//                 {
//                     reject(err);
//                     return;
//                 }

//                 resolve(val);
//             });
//         });
//     }

//     private storeEvent(writeIndex: number, eventData: string | Buffer): Promise<void>
//     {
//         return new Promise((resolve, reject) =>
//         {
//             given(writeIndex, "writeIndex").ensureHasValue().ensureIsNumber();
//             given(eventData, "eventData").ensureHasValue();

//             const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${writeIndex}`;
//             // const expirySeconds = 60 * 60 * 4;
//             const expirySeconds = this._ttlMinutes * 60;

//             this._client.setex(key.trim(), expirySeconds, eventData as any, (err) =>
//             {
//                 if (err)
//                 {
//                     reject(err);
//                     return;
//                 }

//                 resolve();
//             });
//         });
//     }
// }