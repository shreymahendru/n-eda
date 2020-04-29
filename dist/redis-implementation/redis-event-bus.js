"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const eda_manager_1 = require("../eda-manager");
const n_exception_1 = require("@nivinjoseph/n-exception");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const Redis = require("redis");
const n_util_1 = require("@nivinjoseph/n-util");
const n_ject_1 = require("@nivinjoseph/n-ject");
let RedisEventBus = class RedisEventBus {
    constructor(redisClient) {
        this._edaPrefix = "n-eda";
        this._isDisposed = false;
        this._disposePromise = null;
        this._manager = null;
        this._logger = null;
        n_defensive_1.given(redisClient, "redisClient").ensureHasValue().ensureIsObject();
        this._client = redisClient;
    }
    initialize(manager) {
        n_defensive_1.given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager);
        n_defensive_1.given(this, "this").ensure(t => !t._manager, "already initialized");
        this._manager = manager;
        this._logger = this._manager.serviceLocator.resolve("Logger");
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
            const writeIndex = yield n_util_1.Make.retryWithDelay(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    return yield this.incrementPartitionWriteIndex(topic, partition);
                }
                catch (error) {
                    yield this._logger.logWarning(`Error while incrementing partition write index => Topic: ${topic}; Partition: ${partition}; WriteIndex: ${writeIndex};`);
                    yield this._logger.logError(error);
                    throw error;
                }
            }), 20, 1000)();
            yield n_util_1.Make.retryWithDelay(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    yield this.storeEvent(topic, partition, writeIndex, event);
                }
                catch (error) {
                    yield this._logger.logWarning(`Error while storing event of type ${event.name} => Topic: ${topic}; Partition: ${partition}; WriteIndex: ${writeIndex};`);
                    yield this._logger.logError(error);
                    throw error;
                }
            }), 10, 500)();
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
};
RedisEventBus = __decorate([
    n_ject_1.inject("RedisClient"),
    __metadata("design:paramtypes", [Redis.RedisClient])
], RedisEventBus);
exports.RedisEventBus = RedisEventBus;
//# sourceMappingURL=redis-event-bus.js.map