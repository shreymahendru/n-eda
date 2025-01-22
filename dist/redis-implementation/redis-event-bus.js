"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisEventBus = void 0;
const tslib_1 = require("tslib");
const eda_manager_1 = require("../eda-manager");
const n_exception_1 = require("@nivinjoseph/n-exception");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
// import * as Redis from "redis";
const ioredis_1 = require("ioredis");
const n_ject_1 = require("@nivinjoseph/n-ject");
const producer_1 = require("./producer");
const n_util_1 = require("@nivinjoseph/n-util");
const n_config_1 = require("@nivinjoseph/n-config");
const neda_clear_tracked_keys_event_1 = require("./neda-clear-tracked-keys-event");
const event_registration_1 = require("../event-registration");
const neda_distributed_observer_notify_event_1 = require("./neda-distributed-observer-notify-event");
// public
let RedisEventBus = class RedisEventBus {
    constructor(redisClient) {
        this._nedaClearTrackedKeysEventName = neda_clear_tracked_keys_event_1.NedaClearTrackedKeysEvent.getTypeName();
        this._producers = new Map();
        this._isDisposing = false;
        this._isDisposed = false;
        this._disposePromise = null;
        this._manager = null;
        this._logger = null;
        (0, n_defensive_1.given)(redisClient, "redisClient").ensureHasValue().ensureIsObject();
        this._client = redisClient;
    }
    initialize(manager) {
        (0, n_defensive_1.given)(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager);
        (0, n_defensive_1.given)(this, "this").ensure(t => !t._manager, "already initialized");
        this._manager = manager;
        this._logger = this._manager.serviceLocator.resolve("Logger");
        this._manager.topics.forEach(topic => {
            if (topic.isDisabled)
                return;
            for (let partition = 0; partition < topic.numPartitions; partition++) {
                const key = this._generateKey(topic.name, partition);
                this._producers.set(key, new producer_1.Producer(key, this._client, this._logger, topic.name, topic.ttlMinutes, partition));
            }
        });
    }
    publish(topic, ...events) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this._isDisposed) {
                yield this._logger.logError(`Publishing events to topic ${topic} after event bus disposed.`);
                throw new n_exception_1.ObjectDisposedException(this);
            }
            if (this._isDisposing)
                yield this._logger.logWarning(`Publishing events to topic ${topic} while event bus disposing.`);
            (0, n_defensive_1.given)(this, "this")
                .ensure(t => !!t._manager, "not initialized");
            (0, n_defensive_1.given)(topic, "topic").ensureHasValue().ensureIsString()
                .ensure(t => this._manager.topics.some(u => u.name === t));
            (0, n_defensive_1.given)(events, "events").ensureHasValue().ensureIsArray();
            events.forEach(event => (0, n_defensive_1.given)(event, "event").ensureHasValue().ensureIsObject()
                .ensureHasStructure({ id: "string", name: "string" }));
            const pubTopic = this._manager.topics.find(t => t.name === topic);
            if (!pubTopic.isDisabled) // This flow is for standard EDA
             {
                const partitionEvents = new Map();
                for (const event of events) {
                    if (event.name === this._nedaClearTrackedKeysEventName) {
                        for (let partition = 0; partition < pubTopic.numPartitions; partition++) {
                            if (!partitionEvents.has(partition))
                                partitionEvents.set(partition, new Array());
                            partitionEvents.get(partition).push(event);
                        }
                        continue;
                    }
                    if (!this._manager.eventMap.has(event.name))
                        continue;
                    const partition = this._manager.mapToPartition(topic, event);
                    if (!partitionEvents.has(partition))
                        partitionEvents.set(partition, new Array());
                    partitionEvents.get(partition).push(event);
                }
                if (partitionEvents.size === 0)
                    return;
                const promises = new Array();
                partitionEvents.forEach((events, partition) => {
                    const producerKey = this._generateKey(topic, partition);
                    promises.push(this._producers.get(producerKey).produce(...events));
                });
                yield Promise.all(promises);
            }
            if (this._manager.distributedObserverTopic != null && !this._manager.distributedObserverTopic.isDisabled) {
                const partitionEvents = new Map();
                for (const event of events) {
                    // we know the event type and the observable id (ref id)
                    // what we want to do do is figure if any observer has subscribed to this refId and this eventType
                    // Note: in a multi-tenant system, the refId would include the orgId
                    const observableType = event.refType;
                    const observableId = event.refId;
                    const observableEventType = event.name;
                    const observableKey = this._generateObservableKey({ observableType, observableId, observableEventType });
                    const hasSubs = yield this._checkForSubscribers(observableKey);
                    if (hasSubs) {
                        const subs = yield this._fetchSubscribers(observableKey);
                        if (subs.isNotEmpty) {
                            for (const sub of subs) {
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
                                const distributedObserverEvent = new neda_distributed_observer_notify_event_1.NedaDistributedObserverNotifyEvent({
                                    observerTypeName,
                                    observerId,
                                    observedEventId: event.id,
                                    observedEvent: event
                                });
                                const partition = this._manager.mapToPartition(this._manager.distributedObserverTopic.name, distributedObserverEvent);
                                if (!partitionEvents.has(partition))
                                    partitionEvents.set(partition, new Array());
                                partitionEvents.get(partition).push(distributedObserverEvent);
                            }
                        }
                    }
                }
                if (partitionEvents.size === 0)
                    return;
                const promises = new Array();
                partitionEvents.forEach((events, partition) => {
                    const producerKey = this._generateKey(this._manager.distributedObserverTopic.name, partition);
                    promises.push(this._producers.get(producerKey).produce(...events));
                });
                yield Promise.all(promises);
            }
        });
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
    subscribeToObservables(observerType, observerId, watches) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            (0, n_defensive_1.given)(observerType, "observerType").ensureHasValue().ensureIsFunction();
            (0, n_defensive_1.given)(observerId, "observerId").ensureHasValue().ensureIsString();
            (0, n_defensive_1.given)(watches, "watches").ensureHasValue().ensureIsArray();
            if (watches.isEmpty)
                return;
            const observerTypeName = observerType.getTypeName();
            const observerKey = this._generateObserverKey(observerTypeName, observerId);
            const promises = new Array();
            for (const watch of watches) {
                const observableType = watch.observableType.getTypeName();
                const observableEventType = watch.observableEventType.getTypeName();
                const observableKey = this._generateObservableKey(watch);
                // if we want to subscribe, then the handler has to be a registered up front
                const observationKey = event_registration_1.EventRegistration.generateObservationKey(observerTypeName, observableType, observableEventType);
                if (!this._manager.observerEventMap.has(observationKey))
                    throw new n_exception_1.ApplicationException(`No handler registered for observation key '${observationKey}'`);
                promises.push(new Promise((resolve, reject) => {
                    this._client.sadd(observableKey, observerKey, (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve();
                    }).catch(e => reject(e));
                }));
            }
            yield Promise.all(promises);
        });
    }
    unsubscribeFromObservables(observerType, observerId, watches) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            (0, n_defensive_1.given)(observerType, "observerType").ensureHasValue().ensureIsFunction();
            (0, n_defensive_1.given)(observerId, "observerId").ensureHasValue().ensureIsString();
            (0, n_defensive_1.given)(watches, "watches").ensureHasValue().ensureIsArray();
            if (watches.isEmpty)
                return;
            const observerTypeName = observerType.getTypeName();
            const observerKey = this._generateObserverKey(observerTypeName, observerId);
            const promises = new Array();
            for (const watch of watches) {
                const observableKey = this._generateObservableKey(watch);
                promises.push(new Promise((resolve, reject) => {
                    this._client.srem(observableKey, observerKey, (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve();
                    }).catch(e => reject(e));
                }));
            }
            yield Promise.all(promises);
        });
    }
    dispose() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._isDisposing) {
                this._isDisposing = true;
                // this._disposePromise = new Promise((resolve, _) => this._client.quit(() => resolve()));
                this._disposePromise = n_util_1.Delay.seconds(n_config_1.ConfigurationManager.getConfig("env") === "dev" ? 2 : 10)
                    .then(() => {
                    this._isDisposed = true;
                });
            }
            yield this._disposePromise;
        });
    }
    _generateKey(topic, partition) {
        return `${topic}+++${partition}`;
    }
    _generateObservableKey(watch) {
        (0, n_defensive_1.given)(watch, "watch").ensureHasValue().ensureIsObject();
        const observableTypeName = typeof watch.observableType === "string"
            ? watch.observableType : watch.observableType.getTypeName();
        const observableId = watch.observableId;
        const observableEventTypeName = typeof watch.observableEventType === "string"
            ? watch.observableEventType : watch.observableEventType.getTypeName();
        return `n-eda-observable-${observableTypeName}.${observableId}.${observableEventTypeName}`;
    }
    _generateObserverKey(observerTypeName, observerId) {
        (0, n_defensive_1.given)(observerTypeName, "observerTypeName").ensureHasValue().ensureIsString();
        (0, n_defensive_1.given)(observerId, "observerId").ensureHasValue().ensureIsString();
        return `${observerTypeName}.${observerId}`;
    }
    _checkForSubscribers(key) {
        return new Promise((resolve, reject) => {
            this._client.scard(key, (err, val) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(val > 0);
            }).catch(e => reject(e));
        });
    }
    _fetchSubscribers(key) {
        return new Promise((resolve, reject) => {
            this._client.smembers(key, (err, val) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(val !== null && val !== void 0 ? val : []);
            }).catch(e => reject(e));
        });
    }
};
RedisEventBus = tslib_1.__decorate([
    (0, n_ject_1.inject)("EdaRedisClient"),
    tslib_1.__metadata("design:paramtypes", [ioredis_1.default])
], RedisEventBus);
exports.RedisEventBus = RedisEventBus;
//# sourceMappingURL=redis-event-bus.js.map