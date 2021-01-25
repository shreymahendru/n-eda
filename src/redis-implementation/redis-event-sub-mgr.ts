import { EventSubMgr } from "../event-sub-mgr";
import { EdaManager } from "../eda-manager";
import * as Redis from "redis";
import { given } from "@nivinjoseph/n-defensive";
import { Consumer } from "./consumer";
import { Delay } from "@nivinjoseph/n-util";
import { ServiceLocator, inject } from "@nivinjoseph/n-ject";
import { EdaEvent } from "../eda-event";
import { ObjectDisposedException } from "@nivinjoseph/n-exception";
import { Logger } from "@nivinjoseph/n-log";

// public
@inject("RedisClient", "Logger")
export class RedisEventSubMgr implements EventSubMgr
{
    private readonly _client: Redis.RedisClient;
    private readonly _logger: Logger;
    private readonly _consumers = new Array<Consumer>();

    private _isDisposed = false;
    private _disposePromise: Promise<any> | null = null;
    private _manager: EdaManager = null as any;
    private _isConsuming = false;
    
    
    public constructor(redisClient: Redis.RedisClient, logger: Logger)
    {
        given(redisClient, "redisClient").ensureHasValue().ensureIsObject();
        this._client = redisClient;
        
        given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;
    }
    
    
    public initialize(manager: EdaManager): void
    {
        given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(EdaManager);
        
        if (this._isDisposed)
            throw new ObjectDisposedException(this);
        
        given(this, "this").ensure(t => !t._manager, "already initialized");

        this._manager = manager;
    }
    
    public async consume(): Promise<void>
    {
        if (this._isDisposed)
            throw new ObjectDisposedException(this);

        given(this, "this").ensure(t => !!t._manager, "not initialized");
        
        if (!this._isConsuming)
        {
            this._isConsuming = true;
            
            this._manager.topics.forEach(topic =>
            {
                if (topic.publishOnly)
                    return;
                
                if (topic.partitionAffinity != null)
                {
                    topic.partitionAffinity.forEach(partition =>
                        this._consumers.push(new Consumer(this._client, this._manager, topic.name, partition,
                            this.onEventReceived.bind(this))));
                }
                else
                {
                    for (let partition = 0; partition < topic.numPartitions; partition++)
                    {
                        this._consumers.push(new Consumer(this._client, this._manager, topic.name, partition,
                            this.onEventReceived.bind(this)));
                    }
                }
            });

            this._consumers.forEach(t => t.consume());
        }
        
        while (!this._isDisposed)
        {
            await Delay.seconds(2);
        }
    }
    
    public async dispose(): Promise<void>
    {
        if (!this._isDisposed)
        {
            this._isDisposed = true;
            
            this._disposePromise = Promise.all(this._consumers.map(t => t.dispose()));
            
            if (this._manager.metricsEnabled)
            {
                await Delay.seconds(5);
                
                const totals = this._consumers.reduce((acc, t) =>
                {
                    acc.eventCount += t.eventCount;
                    acc.eventsProcessingTime += t.eventsProcessingTime;
                    return acc;
                }, { eventCount: 0, eventsProcessingTime: 0 });    
                
                await this._logger.logInfo(`[EVENTS CONSUMER ${this._manager.consumerName ?? "UNKNOWN"}]:  Total events processed = ${totals.eventCount}; Total processing time = ${totals.eventsProcessingTime}; Average processing time per event = ${totals.eventsProcessingTime / totals.eventCount};`);
            }
        }

        await this._disposePromise;
    }    
    
    
    protected onEventReceived(scope: ServiceLocator, topic: string, event: EdaEvent): void
    {
        given(scope, "scope").ensureHasValue().ensureIsObject();
        given(topic, "topic").ensureHasValue().ensureIsString();
        given(event, "event").ensureHasValue().ensureIsObject();
    }
}