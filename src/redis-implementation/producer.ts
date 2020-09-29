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
    private readonly _partition: number;
    private readonly _mutex = new Mutex();
    
    
    public constructor(client: Redis.RedisClient, logger: Logger, topic: string, partition: number)
    {
        given(client, "client").ensureHasValue().ensureIsObject();
        this._client = client;
        
        given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;

        given(topic, "topic").ensureHasValue().ensureIsString();
        this._topic = topic;

        given(partition, "partition").ensureHasValue().ensureIsNumber();
        this._partition = partition;
    }
    
    
    public async produce(event: EdaEvent): Promise<void>
    {
        given(event, "event").ensureHasValue().ensureIsObject()
            .ensureHasStructure({
                id: "string",
                name: "string"
            }); 

        const compressedEvent = await this.compressEvent(event.serialize());

        const writeIndex = await this.acquireWriteIndex();

        await Make.retryWithDelay(async () =>
        {
            try 
            {
                await this.storeEvent(writeIndex, compressedEvent);
            }
            catch (error)
            {
                await this._logger.logWarning(`Error while storing event of type ${event.name} => Topic: ${this._topic}; Partition: ${this._partition}; WriteIndex: ${writeIndex};`);
                await this._logger.logError(error);
                throw error;
            }

        }, 20, 1000)();
    }
    
    private async compressEvent(event: object): Promise<string>
    {
        given(event, "event").ensureHasValue().ensureIsObject();

        const compressed = await Make.callbackToPromise<Buffer>(Zlib.brotliCompress)(Buffer.from(JSON.stringify(event), "utf8"),
            { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } });

        return compressed.toString("base64");
    }
    
    private async acquireWriteIndex(): Promise<number>
    {
        await this._mutex.lock();

        try
        {
            return await Make.retryWithDelay(async () =>
            {
                try 
                {
                    return await this.incrementPartitionWriteIndex();
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

    private incrementPartitionWriteIndex(): Promise<number>
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

    private storeEvent(writeIndex: number, eventData: string): Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
            given(writeIndex, "writeIndex").ensureHasValue().ensureIsNumber();
            given(eventData, "eventData").ensureHasValue().ensureIsString();

            const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${writeIndex}`;
            const expirySeconds = 60 * 60 * 4;

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
}