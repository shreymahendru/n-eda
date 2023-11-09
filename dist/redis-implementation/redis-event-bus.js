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
            if (pubTopic.isDisabled)
                return;
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
};
RedisEventBus = tslib_1.__decorate([
    (0, n_ject_1.inject)("EdaRedisClient"),
    tslib_1.__metadata("design:paramtypes", [ioredis_1.default])
], RedisEventBus);
exports.RedisEventBus = RedisEventBus;
//# sourceMappingURL=redis-event-bus.js.map