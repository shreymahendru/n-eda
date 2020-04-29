import { EventBus } from "../event-bus";
import { EdaManager } from "../eda-manager";
import { EdaEvent } from "../eda-event";
import { ObjectDisposedException } from "@nivinjoseph/n-exception";
import { given } from "@nivinjoseph/n-defensive";
import * as Redis from "redis";
import { Make } from "@nivinjoseph/n-util";
import { Logger } from "@nivinjoseph/n-log";
import { inject } from "@nivinjoseph/n-ject";

// public
@inject("RedisClient")
export class RedisEventBus implements EventBus
{
    private readonly _edaPrefix = "n-eda";
    private readonly _client: Redis.RedisClient;
    
    private _isDisposed = false;
    private _disposePromise: Promise<void> | null = null;
    private _manager: EdaManager = null as any;
    private _logger: Logger = null as any;
    
    
    public constructor(redisClient: Redis.RedisClient)
    {
        given(redisClient, "redisClient").ensureHasValue().ensureIsObject();
        this._client = redisClient;
    }
    
    
    public initialize(manager: EdaManager): void
    {
        given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(EdaManager);
        given(this, "this").ensure(t => !t._manager, "already initialized");

        this._manager = manager;
        this._logger = this._manager.serviceLocator.resolve<Logger>("Logger");
    }
    
    public async publish(topic: string, event: EdaEvent): Promise<void>
    {
        if (this._isDisposed)
            throw new ObjectDisposedException(this);
        
        given(this, "this")
            .ensure(t => !!t._manager, "not initialized");
        
        given(topic, "topic").ensureHasValue().ensureIsString()
            .ensure(t => this._manager.topics.some(u => u.name === t));
        given(event, "event").ensureHasValue().ensureIsObject()
            .ensureHasStructure({
                id: "string",
                name: "string"
            });       
        
        if (!this._manager.eventMap.has(event.name))
            return;
        
        const partition = this._manager.mapToPartition(topic, event);
        const writeIndex = await Make.retryWithDelay(async () =>
        {
            try 
            {
                return await this.incrementPartitionWriteIndex(topic, partition);    
            }
            catch (error)
            {
                await this._logger.logWarning(`Error while incrementing partition write index => Topic: ${topic}; Partition: ${partition}; WriteIndex: ${writeIndex};`);
                await this._logger.logError(error);
                throw error;
            }
            
        }, 20, 1000)();
        
        await Make.retryWithDelay(async () =>
        {
            try 
            {
                await this.storeEvent(topic, partition, writeIndex, event);
            }
            catch (error)
            {
                await this._logger.logWarning(`Error while storing event of type ${event.name} => Topic: ${topic}; Partition: ${partition}; WriteIndex: ${writeIndex};`);
                await this._logger.logError(error);
                throw error;
            }
            
        }, 10, 500)();
    }
    
    public async dispose(): Promise<void>
    {
        if (!this._isDisposed)
        {
            this._isDisposed = true;
            this._disposePromise = new Promise((resolve, _) => this._client.quit(() => resolve()));
        }

        return this._disposePromise as Promise<void>;
    }
    
    private incrementPartitionWriteIndex(topic: string, partition: number): Promise<number>
    {
        return new Promise((resolve, reject) =>
        {
            given(topic, "topic").ensureHasValue().ensureIsString();
            given(partition, "partition").ensureHasValue().ensureIsNumber();
            
            const key = `${this._edaPrefix}-${topic}-${partition}-write-index`;
            
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
    
    private storeEvent(topic: string, partition: number, writeIndex: number, event: EdaEvent): Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
            given(topic, "topic").ensureHasValue().ensureIsString();
            given(partition, "partition").ensureHasValue().ensureIsNumber();
            given(writeIndex, "writeIndex").ensureHasValue().ensureIsNumber();
            given(event, "event").ensureHasValue().ensureIsObject();
            
            const key = `${this._edaPrefix}-${topic}-${partition}-${writeIndex}`;
            const expirySeconds = 60 * 60 * 4;
            this._client.setex(key.trim(), expirySeconds, JSON.stringify(event.serialize()), (err) =>
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