import { given } from "@nivinjoseph/n-defensive";
import { ApplicationException, ObjectDisposedException } from "@nivinjoseph/n-exception";
import { EdaEvent } from "../eda-event.js";
import { EdaManager } from "../eda-manager.js";
import { EventBus, ObservableWatch } from "../event-bus.js";
// import * as Redis from "redis";
import { ConfigurationManager } from "@nivinjoseph/n-config";
import { inject } from "@nivinjoseph/n-ject";
import { Logger } from "@nivinjoseph/n-log";
import { Delay } from "@nivinjoseph/n-util";
import { Redis } from "ioredis";
import { EventRegistration } from "../event-registration.js";
import { NedaClearTrackedKeysEvent } from "./neda-clear-tracked-keys-event.js";
import { NedaDistributedObserverNotifyEvent } from "./neda-distributed-observer-notify-event.js";
import { Producer } from "./producer.js";

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
        if (!pubTopic.isDisabled) // This flow is for standard EDA
        {
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

        if (this._manager.distributedObserverTopic != null && !this._manager.distributedObserverTopic.isDisabled)
        {
            const partitionEvents = new Map<number, Array<EdaEvent>>();

            for (const event of events)
            {
                // we know the event type and the observable id (ref id)

                // what we want to do do is figure if any observer has subscribed to this refId and this eventType
                // Note: in a multi-tenant system, the refId would include the orgId

                const observableType = event.refType;
                const observableId = event.refId;
                const observableEventType = event.name;

                const observableKey = this._generateObservableKey({ observableType, observableId, observableEventType });

                const hasSubs = await this._checkForSubscribers(observableKey);
                if (hasSubs)
                {
                    const subs = await this._fetchSubscribers(observableKey);

                    if (subs.isNotEmpty)
                    {
                        for (const sub of subs)
                        {
                            const [observerTypeName, observerId] = sub.split(".");

                            // TODO: do be really care about this check? this check is actually done on subscribe and wouldn't make sense here from a distributed systems standpoint considering rolling deployments
                            // const observationKey = EventRegistration.generateObservationKey(
                            //     observerTypeName, observableType,
                            //     observableEventType);
                            // if (!this._manager.observerEventMap.has(observationKey))
                            //     continue;


                            // So for each sub
                            // we are going to wrap this event into a DistributedObserverEvent
                            // and send it with the partition key being the observerId
                            // and we will send it on the distributed observer topic

                            const distributedObserverEvent = new NedaDistributedObserverNotifyEvent({
                                observerTypeName,
                                observerId,
                                observedEventId: event.id,
                                observedEvent: event
                            });

                            const partition = this._manager.mapToPartition(
                                this._manager.distributedObserverTopic.name, distributedObserverEvent);
                            if (!partitionEvents.has(partition))
                                partitionEvents.set(partition, new Array<EdaEvent>());
                            partitionEvents.get(partition)!.push(distributedObserverEvent);
                        }
                    }
                }
            }

            if (partitionEvents.size === 0)
                return;

            const promises = new Array<Promise<void>>();
            partitionEvents.forEach((events, partition) =>
            {
                const producerKey = this._generateKey(this._manager.distributedObserverTopic!.name, partition);
                promises.push(this._producers.get(producerKey)!.produce(...events));
            });
            await Promise.all(promises);
        }
    }

    // public publishToObservers(events: ReadonlyArray<EdaEvent>): Promise<void>
    // {
    //     // Distributed observer will be managed on a completely separate single topic with its own partitions and single consumer group
    // }

    // public subscribeToObservables(subscriber: string, watches: ReadonlyArray<string>): Promise<void>
    // {
    //     // I the subscriber want to be notified about the things that I am watching

    //     // subscriber key has a corresponding set of watch keys. 
    //     // This information is used to create a delta to figure out unsubscribes automatically

    //     // for each watch key, there is a set of subscribers
    // }

    public async subscribeToObservables(observerType: Function, observerId: string, watches: ReadonlyArray<ObservableWatch>): Promise<void>
    {
        given(observerType, "observerType").ensureHasValue().ensureIsFunction();
        given(observerId, "observerId").ensureHasValue().ensureIsString();
        given(watches, "watches").ensureHasValue().ensureIsArray();

        if (watches.isEmpty)
            return;

        const observerTypeName = (<Object>observerType).getTypeName();
        const observerKey = this._generateObserverKey(observerTypeName, observerId);

        const promises = new Array<Promise<void>>();

        for (const watch of watches)
        {
            const observableType = (<Object>watch.observableType).getTypeName();
            const observableEventType = (<Object>watch.observableEventType).getTypeName();

            const observableKey = this._generateObservableKey(watch);

            // if we want to subscribe, then the handler has to be a registered up front
            const observationKey = EventRegistration.generateObservationKey(observerTypeName,
                observableType, observableEventType);
            if (!this._manager.observerEventMap.has(observationKey))
                throw new ApplicationException(`No handler registered for observation key '${observationKey}'`);

            promises.push(new Promise<void>((resolve, reject) =>
            {
                this._client.sadd(observableKey, observerKey, (err) =>
                {
                    if (err)
                    {
                        reject(err);
                        return;
                    }

                    resolve();
                }).catch(e => reject(e));
            }));
        }

        await Promise.all(promises);
    }

    public async unsubscribeFromObservables(observerType: Function, observerId: string, watches: ReadonlyArray<ObservableWatch>): Promise<void>
    {
        given(observerType, "observerType").ensureHasValue().ensureIsFunction();
        given(observerId, "observerId").ensureHasValue().ensureIsString();
        given(watches, "watches").ensureHasValue().ensureIsArray();

        if (watches.isEmpty)
            return;

        const observerTypeName = (<Object>observerType).getTypeName();
        const observerKey = this._generateObserverKey(observerTypeName, observerId);

        const promises = new Array<Promise<void>>();

        for (const watch of watches)
        {
            const observableKey = this._generateObservableKey(watch);

            promises.push(new Promise<void>((resolve, reject) =>
            {
                this._client.srem(observableKey, observerKey, (err) =>
                {
                    if (err)
                    {
                        reject(err);
                        return;
                    }

                    resolve();
                }).catch(e => reject(e));
            }));
        }

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

    private _generateObservableKey(watch: ObservableWatch): string
    {
        given(watch, "watch").ensureHasValue().ensureIsObject();

        const observableTypeName = typeof watch.observableType === "string"
            ? watch.observableType : (<Object>watch.observableType).getTypeName();
        const observableId = watch.observableId;
        const observableEventTypeName = typeof watch.observableEventType === "string"
            ? watch.observableEventType : (<Object>watch.observableEventType).getTypeName();

        return `n-eda-observable-${observableTypeName}.${observableId}.${observableEventTypeName}`;
    }

    private _generateObserverKey(observerTypeName: string, observerId: string): string
    {
        given(observerTypeName, "observerTypeName").ensureHasValue().ensureIsString();
        given(observerId, "observerId").ensureHasValue().ensureIsString();

        return `${observerTypeName}.${observerId}`;
    }

    private _checkForSubscribers(key: string): Promise<boolean>
    {
        return new Promise((resolve, reject) =>
        {
            this._client.scard(key, (err, val) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                resolve(val! > 0);
            }).catch(e => reject(e));
        });
    }

    private _fetchSubscribers(key: string): Promise<Array<string>>
    {
        return new Promise((resolve, reject) =>
        {
            this._client.smembers(key, (err, val) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                resolve(val ?? []);
            }).catch(e => reject(e));
        });
    }
}