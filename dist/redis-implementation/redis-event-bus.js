"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const eda_manager_1 = require("../eda-manager");
const n_exception_1 = require("@nivinjoseph/n-exception");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const Redis = require("redis");
const n_config_1 = require("@nivinjoseph/n-config");
class RedisEventBus {
    constructor() {
        this._edaPrefix = "n-eda";
        this._isDisposed = false;
        this._disposePromise = null;
        this._manager = null;
        this._client = n_config_1.ConfigurationManager.getConfig("env") === "dev"
            ? Redis.createClient() : Redis.createClient(n_config_1.ConfigurationManager.getConfig("REDIS_URL"));
    }
    initialize(manager) {
        n_defensive_1.given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager);
        n_defensive_1.given(this, "this").ensure(t => !t._manager, "already initialized");
        this._manager = manager;
    }
    publish(topic, event) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._isDisposed)
                throw new n_exception_1.ObjectDisposedException(this);
            n_defensive_1.given(this, "this")
                .ensure(t => !!t._manager, "not initialized");
            n_defensive_1.given(topic, "topic").ensureHasValue().ensureIsString()
                .ensure(t => this._manager.topics.some(u => u.name === t));
            n_defensive_1.given(event, "event").ensureHasValue().ensureIsObject()
                .ensureHasStructure({
                id: "string",
                name: "string"
            });
            if (!this._manager.eventMap.has(event.name))
                return;
            const partition = this._manager.mapToPartition(topic, event);
            const writeIndex = yield this.incrementPartitionWriteIndex(topic, partition);
            yield this.storeEvent(topic, partition, writeIndex, event);
        });
    }
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._isDisposed) {
                this._isDisposed = true;
                this._disposePromise = new Promise((resolve, _) => this._client.quit(() => resolve()));
            }
            return this._disposePromise;
        });
    }
    incrementPartitionWriteIndex(topic, partition) {
        return new Promise((resolve, reject) => {
            n_defensive_1.given(topic, "topic").ensureHasValue().ensureIsString();
            n_defensive_1.given(partition, "partition").ensureHasValue().ensureIsNumber();
            const key = `${this._edaPrefix}-${topic}-${partition}-write-index`;
            this._client.incr(key, (err, val) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(val);
            });
        });
    }
    storeEvent(topic, partition, writeIndex, event) {
        return new Promise((resolve, reject) => {
            n_defensive_1.given(topic, "topic").ensureHasValue().ensureIsString();
            n_defensive_1.given(partition, "partition").ensureHasValue().ensureIsNumber();
            n_defensive_1.given(writeIndex, "writeIndex").ensureHasValue().ensureIsNumber();
            n_defensive_1.given(event, "event").ensureHasValue().ensureIsObject();
            const key = `${this._edaPrefix}-${topic}-${partition}-${writeIndex}`;
            const expirySeconds = 60 * 60 * 4;
            this._client.setex(key.trim(), expirySeconds, JSON.stringify(event.serialize()), (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }
}
exports.RedisEventBus = RedisEventBus;
//# sourceMappingURL=redis-event-bus.js.map