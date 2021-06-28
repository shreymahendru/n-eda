"use strict";
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
exports.Consumer = void 0;
const n_util_1 = require("@nivinjoseph/n-util");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const eda_manager_1 = require("../eda-manager");
const n_exception_1 = require("@nivinjoseph/n-exception");
const Zlib = require("zlib");
const broker_1 = require("./broker");
class Consumer {
    constructor(client, manager, topic, partition) {
        this._edaPrefix = "n-eda";
        this._defaultDelayMS = 150;
        this._isDisposed = false;
        this._trackedKeysSet = new Set();
        this._consumePromise = null;
        this._broker = null;
        n_defensive_1.given(client, "client").ensureHasValue().ensureIsObject();
        this._client = client;
        n_defensive_1.given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager);
        this._manager = manager;
        this._logger = this._manager.serviceLocator.resolve("Logger");
        n_defensive_1.given(topic, "topic").ensureHasValue().ensureIsString();
        this._topic = topic;
        n_defensive_1.given(partition, "partition").ensureHasValue().ensureIsNumber();
        this._partition = partition;
        this._id = `${this._topic}-${this._partition}`;
        this._cleanKeys = this._manager.cleanKeys;
    }
    get id() { return this._id; }
    registerBroker(broker) {
        n_defensive_1.given(broker, "broker").ensureHasValue().ensureIsObject().ensureIsObject().ensureIsType(broker_1.Broker);
        this._broker = broker;
    }
    consume() {
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException("Consumer");
        n_defensive_1.given(this, "this").ensure(t => !t._consumePromise, "consumption has already commenced");
        this._consumePromise = this.beginConsume();
    }
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._isDisposed) {
                this._isDisposed = true;
                yield this._saveTrackedKeys();
                const consumePromise = this._consumePromise || Promise.resolve();
                yield consumePromise;
                yield this._saveTrackedKeys();
            }
        });
    }
    beginConsume() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._loadTrackedKeys();
            while (true) {
                if (this._isDisposed)
                    return;
                try {
                    const writeIndex = yield this._fetchPartitionWriteIndex();
                    const readIndex = yield this._fetchConsumerPartitionReadIndex();
                    if (readIndex >= writeIndex) {
                        yield n_util_1.Delay.milliseconds(this._defaultDelayMS);
                        continue;
                    }
                    const maxRead = 50;
                    const lowerBoundReadIndex = readIndex + 1;
                    const upperBoundReadIndex = (writeIndex - readIndex) > maxRead ? (readIndex + maxRead - 1) : writeIndex;
                    const eventsData = yield this._batchRetrieveEvents(lowerBoundReadIndex, upperBoundReadIndex);
                    const routed = new Array();
                    for (const item of eventsData) {
                        if (this._isDisposed)
                            return;
                        if (this._trackedKeysSet.has(item.key)) {
                            yield this._incrementConsumerPartitionReadIndex();
                            continue;
                        }
                        let eventData = item.value;
                        if (eventData == null)
                            eventData = yield this._retrieveEvent(item.key);
                        let numReadAttempts = 1;
                        const maxReadAttempts = 50;
                        while (eventData == null && numReadAttempts < maxReadAttempts) // we need to do this to deal with race condition
                         {
                            if (this._isDisposed)
                                return;
                            yield n_util_1.Delay.milliseconds(100);
                            eventData = yield this._retrieveEvent(item.key);
                            numReadAttempts++;
                        }
                        if (eventData == null) {
                            try {
                                throw new n_exception_1.ApplicationException(`Failed to read event data after ${maxReadAttempts} read attempts => Topic=${this._topic}; Partition=${this._partition}; ReadIndex=${item.index};`);
                            }
                            catch (error) {
                                yield this._logger.logError(error);
                            }
                            yield this._incrementConsumerPartitionReadIndex();
                            continue;
                        }
                        const event = yield this.decompressEvent(eventData);
                        const eventId = event.$id || event.id; // for compatibility with n-domain DomainEvent
                        const eventName = event.$name || event.name; // for compatibility with n-domain DomainEvent
                        const eventRegistration = this._manager.eventMap.get(eventName);
                        // const deserializedEvent = (<any>eventRegistration.eventType).deserializeEvent(event);
                        const deserializedEvent = n_util_1.Deserializer.deserialize(event);
                        routed.push(this._attemptRoute(eventName, eventRegistration, item.index, item.key, eventId, deserializedEvent));
                    }
                    yield Promise.all(routed);
                    if (this._isDisposed)
                        return;
                    yield this._incrementConsumerPartitionReadIndex(upperBoundReadIndex);
                }
                catch (error) {
                    yield this._logger.logWarning(`Error in consumer => ConsumerGroupId: ${this._manager.consumerGroupId}; Topic: ${this._topic}; Partition: ${this._partition};`);
                    yield this._logger.logError(error);
                    if (this._isDisposed)
                        return;
                    yield n_util_1.Delay.seconds(5);
                }
            }
        });
    }
    _attemptRoute(eventName, eventRegistration, eventIndex, eventKey, eventId, event) {
        return __awaiter(this, void 0, void 0, function* () {
            let failed = false;
            try {
                yield this._broker.route({
                    consumerId: this._id,
                    topic: this._topic,
                    partition: this._partition,
                    eventName,
                    eventRegistration,
                    eventIndex,
                    eventKey,
                    eventId,
                    event,
                    partitionKey: this._manager.partitionKeyMapper(event)
                });
            }
            catch (error) {
                failed = true;
                yield this._logger.logWarning(`Failed to consume event of type '${eventName}' with data ${JSON.stringify(event.serialize())}`);
                yield this._logger.logError(error);
            }
            finally {
                if (failed && this._isDisposed) // cuz it could have failed because things were disposed
                    return;
                yield this.track(eventKey);
            }
        });
    }
    _fetchPartitionWriteIndex() {
        const key = `${this._edaPrefix}-${this._topic}-${this._partition}-write-index`;
        return new Promise((resolve, reject) => {
            this._client.get(key, (err, value) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(value != null ? JSON.parse(value) : 0);
            });
        });
    }
    _fetchConsumerPartitionReadIndex() {
        const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${this._manager.consumerGroupId}-read-index`;
        return new Promise((resolve, reject) => {
            this._client.get(key, (err, value) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(value != null ? JSON.parse(value) : 0);
            });
        });
    }
    _incrementConsumerPartitionReadIndex(index) {
        const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${this._manager.consumerGroupId}-read-index`;
        if (index != null) {
            return new Promise((resolve, reject) => {
                this._client.set(key, index.toString(), (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                });
            });
        }
        return new Promise((resolve, reject) => {
            this._client.incr(key, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }
    _retrieveEvent(key) {
        return new Promise((resolve, reject) => {
            this._client.get(key, (err, value) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(value);
            });
        });
    }
    _batchRetrieveEvents(lowerBoundIndex, upperBoundIndex) {
        return new Promise((resolve, reject) => {
            const keys = new Array();
            for (let i = lowerBoundIndex; i <= upperBoundIndex; i++) {
                const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${i}`;
                keys.push({ index: i, key });
            }
            this._client.mget(...keys.map(t => t.key), (err, values) => {
                if (err) {
                    reject(err);
                    return;
                }
                const result = values.map((t, index) => ({
                    index: keys[index].index,
                    key: keys[index].key,
                    value: t
                }));
                resolve(result);
            });
        });
    }
    track(eventKey) {
        return __awaiter(this, void 0, void 0, function* () {
            this._trackedKeysSet.add(eventKey);
            if (this._trackedKeysSet.size >= 300) {
                const trackedKeysArray = [...this._trackedKeysSet.values()];
                this._trackedKeysSet = new Set(trackedKeysArray.skip(200));
                if (this._cleanKeys) {
                    const erasedKeys = trackedKeysArray.take(200);
                    yield this.removeKeys(erasedKeys);
                }
                yield this._saveTrackedKeys();
            }
        });
    }
    _saveTrackedKeys() {
        if (this._trackedKeysSet.size === 0)
            return Promise.resolve();
        return new Promise((resolve, reject) => {
            const key = `${this._edaPrefix}-${this._topic}-${this._partition}-tracked_keys`;
            this._client.lpush(key, ...this._trackedKeysSet.values(), (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (this._isDisposed) {
                    resolve();
                    return;
                }
                this._client.ltrim(key, 0, 200, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                });
            });
        });
    }
    _loadTrackedKeys() {
        return new Promise((resolve, reject) => {
            const key = `${this._edaPrefix}-${this._topic}-${this._partition}-tracked_keys`;
            this._client.lrange(key, 0, -1, (err, keys) => {
                if (err) {
                    reject(err);
                    return;
                }
                this._trackedKeysSet = new Set(keys.reverse());
                resolve();
            });
        });
    }
    decompressEvent(eventData) {
        return __awaiter(this, void 0, void 0, function* () {
            const decompressed = yield n_util_1.Make.callbackToPromise(Zlib.brotliDecompress)(eventData, { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } });
            return JSON.parse(decompressed.toString("utf8"));
        });
    }
    removeKeys(keys) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                // const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${indexToRead}`;
                this._client.unlink(...keys, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                });
            });
        });
    }
}
exports.Consumer = Consumer;
//# sourceMappingURL=consumer.js.map