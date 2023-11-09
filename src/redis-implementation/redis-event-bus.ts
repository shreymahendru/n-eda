import { EventBus } from "../event-bus";
import { EdaManager } from "../eda-manager";
import { EdaEvent } from "../eda-event";
import { ObjectDisposedException } from "@nivinjoseph/n-exception";
import { given } from "@nivinjoseph/n-defensive";
// import * as Redis from "redis";
import Redis from "ioredis";
import { Logger } from "@nivinjoseph/n-log";
import { inject } from "@nivinjoseph/n-ject";
import { Producer } from "./producer";
import { Delay } from "@nivinjoseph/n-util";
import { ConfigurationManager } from "@nivinjoseph/n-config";
import { NedaClearTrackedKeysEvent } from "./neda-clear-tracked-keys-event";

// public
@inject("EdaRedisClient")
export class RedisEventBus implements EventBus
{
    private readonly _nedaClearTrackedKeysEventName = (<Object>NedaClearTrackedKeysEvent).getTypeName();
    private readonly _client: Redis;
    private readonly _producers = new Map<string, Producer>();
    
    
    private _isDisposing = false;
    private _isDisposed = false;
    private _disposePromise: Promise<void> | null = null;
    private _manager: EdaManager = null as any;
    private _logger: Logger = null as any;
    
    
    public constructor(redisClient: Redis)
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
        
        this._manager.topics.forEach(topic =>
        {
            if (topic.isDisabled)
                return;
            
            for (let partition = 0; partition < topic.numPartitions; partition++)
            {
                const key = this._generateKey(topic.name, partition);
                this._producers.set(key,
                    new Producer(key, this._client, this._logger, topic.name, topic.ttlMinutes, partition));
            }
        });
    }
    
    public async publish(topic: string, ...events: ReadonlyArray<EdaEvent>): Promise<void>
    {
        if (this._isDisposed)
        {
            await this._logger.logError(`Publishing events to topic ${topic} after event bus disposed.`);
            throw new ObjectDisposedException(this);
        }
        
        if (this._isDisposing)
            await this._logger.logWarning(`Publishing events to topic ${topic} while event bus disposing.`);

        given(this, "this")
            .ensure(t => !!t._manager, "not initialized");

        given(topic, "topic").ensureHasValue().ensureIsString()
            .ensure(t => this._manager.topics.some(u => u.name === t));
        
        given(events, "events").ensureHasValue().ensureIsArray();
        events.forEach(event =>
            given(event, "event").ensureHasValue().ensureIsObject()
                .ensureHasStructure({ id: "string", name: "string" }));
        
        const pubTopic = this._manager.topics.find(t => t.name === topic)!;
        if (pubTopic.isDisabled)
            return;
        
        const partitionEvents = new Map<number, Array<EdaEvent>>();
        
        for (const event of events)
        {
            if (event.name === this._nedaClearTrackedKeysEventName)
            {
                for (let partition = 0; partition < pubTopic.numPartitions; partition++)
                {
                    if (!partitionEvents.has(partition))
                        partitionEvents.set(partition, new Array<EdaEvent>());
                    partitionEvents.get(partition)!.push(event);
                }
                
                continue;
            }
            
            if (!this._manager.eventMap.has(event.name))
                continue;
            
            const partition = this._manager.mapToPartition(topic, event);
            if (!partitionEvents.has(partition))
                partitionEvents.set(partition, new Array<EdaEvent>());
            partitionEvents.get(partition)!.push(event);
        }
        
        if (partitionEvents.size === 0)
            return;
        
        const promises = new Array<Promise<void>>();
        partitionEvents.forEach((events, partition) =>
        {
            const producerKey = this._generateKey(topic, partition);
            promises.push(this._producers.get(producerKey)!.produce(...events));
        });
        await Promise.all(promises);
    }
    
    public async dispose(): Promise<void>
    {
        if (!this._isDisposing)
        {
            this._isDisposing = true;
            // this._disposePromise = new Promise((resolve, _) => this._client.quit(() => resolve()));
            this._disposePromise = Delay.seconds(ConfigurationManager.getConfig<string>("env") === "dev" ? 2 : 10)
                .then(() =>
                {
                    this._isDisposed = true;
                });
        }

        await this._disposePromise;
    }
    
    private _generateKey(topic: string, partition: number): string
    {
        return `${topic}+++${partition}`;
    }
}