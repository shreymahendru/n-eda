"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisEventBus = void 0;
const tslib_1 = require("tslib");
const eda_manager_1 = require("../eda-manager");
const n_exception_1 = require("@nivinjoseph/n-exception");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const Redis = require("redis");
const n_ject_1 = require("@nivinjoseph/n-ject");
const producer_1 = require("./producer");
const n_util_1 = require("@nivinjoseph/n-util");
const n_config_1 = require("@nivinjoseph/n-config");
// public
let RedisEventBus = class RedisEventBus {
    constructor(redisClient) {
        this._producers = new Map();
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
                this._producers.set(key, new producer_1.Producer(this._client, this._logger, topic.name, topic.ttlMinutes, partition));
            }
        });
    }
    publish(topic, ...events) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this._isDisposed)
                throw new n_exception_1.ObjectDisposedException(this);
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
            events = events.where(event => this._manager.eventMap.has(event.name));
            if (events.isEmpty)
                return;
            yield events.groupBy(event => this._manager.mapToPartition(topic, event).toString())
                .forEachAsync((group) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                const partition = Number.parseInt(group.key);
                const key = this._generateKey(topic, partition);
                yield this._producers.get(key).produce(...group.values);
            }));
        });
    }
    dispose() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._isDisposed) {
                this._isDisposed = true;
                // this._disposePromise = new Promise((resolve, _) => this._client.quit(() => resolve()));
                this._disposePromise = n_util_1.Delay.seconds(n_config_1.ConfigurationManager.getConfig("env") === "dev" ? 2 : 10);
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
    tslib_1.__metadata("design:paramtypes", [Redis.RedisClient])
], RedisEventBus);
exports.RedisEventBus = RedisEventBus;
//# sourceMappingURL=redis-event-bus.js.map