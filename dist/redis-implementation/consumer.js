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
class Consumer {
    constructor(client, manager, topic, partition, onEventReceived) {
        this._edaPrefix = "n-eda";
        this._eventCount = 0;
        this._eventsProcessingTime = 0;
        this._isDisposed = false;
        this._trackedIds = new Array();
        this._consumePromise = null;
        n_defensive_1.given(client, "client").ensureHasValue().ensureIsObject();
        this._client = client;
        n_defensive_1.given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager);
        this._manager = manager;
        this._logger = this._manager.serviceLocator.resolve("Logger");
        n_defensive_1.given(topic, "topic").ensureHasValue().ensureIsString();
        this._topic = topic;
        n_defensive_1.given(partition, "partition").ensureHasValue().ensureIsNumber();
        this._partition = partition;
        n_defensive_1.given(onEventReceived, "onEventReceived").ensureHasValue().ensureIsFunction();
        this._onEventReceived = onEventReceived;
    }
    get eventCount() { return this._eventCount; }
    get eventsProcessingTime() { return this._eventsProcessingTime; }
    consume() {
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException(this);
        n_defensive_1.given(this, "this").ensure(t => !t._consumePromise, "consumption has already commenced");
        this._consumePromise = this.beginConsume();
    }
    dispose() {
        if (!this._isDisposed)
            this._isDisposed = true;
        return this._consumePromise || Promise.resolve();
    }
    beginConsume() {
        return __awaiter(this, void 0, void 0, function* () {
            while (true) {
                if (this._isDisposed)
                    return;
                try {
                    const writeIndex = yield this.getPartitionWriteIndex();
                    const readIndex = yield this.getConsumerPartitionReadIndex();
                    if (readIndex >= writeIndex) {
                        yield n_util_1.Delay.seconds(1);
                        continue;
                    }
                    const maxRead = 50;
                    const lowerBoundReadIndex = readIndex + 1;
                    const upperBoundReadIndex = (writeIndex - readIndex) > maxRead ? readIndex + maxRead : writeIndex;
                    const eventsData = yield this.retrieveEvents(lowerBoundReadIndex, upperBoundReadIndex);
                    for (const item of eventsData) {
                        if (this._isDisposed)
                            return;
                        const profiler = this._manager.metricsEnabled ? new n_util_1.Profiler() : null;
                        let eventData = item.value;
                        let numReadAttempts = 1;
                        const maxReadAttempts = 10;
                        while (eventData == null && numReadAttempts < maxReadAttempts) {
                            if (this._isDisposed)
                                return;
                            yield n_util_1.Delay.milliseconds(500);
                            eventData = yield this.retrieveEvent(item.index);
                            numReadAttempts++;
                        }
                        if (eventData == null) {
                            try {
                                throw new n_exception_1.ApplicationException(`Failed to read event data after ${maxReadAttempts} read attempts => Topic=${this._topic}; Partition=${this._partition}; ReadIndex=${item.index};`);
                            }
                            catch (error) {
                                yield this._logger.logError(error);
                            }
                            yield this.incrementConsumerPartitionReadIndex();
                            continue;
                        }
                        const event = yield this.decompressEvent(eventData);
                        const eventId = event.$id || event.id;
                        const eventName = event.$name || event.name;
                        const eventRegistration = this._manager.eventMap.get(eventName);
                        const deserializedEvent = n_util_1.Deserializer.deserialize(event);
                        if (this._trackedIds.contains(eventId)) {
                            yield this.incrementConsumerPartitionReadIndex();
                            continue;
                        }
                        let failed = false;
                        try {
                            yield n_util_1.Make.retryWithExponentialBackoff(() => __awaiter(this, void 0, void 0, function* () {
                                if (this._isDisposed) {
                                    failed = true;
                                    return;
                                }
                                yield this.processEvent(eventName, eventRegistration, deserializedEvent);
                            }), 5)();
                        }
                        catch (error) {
                            failed = true;
                            yield this._logger.logWarning(`Failed to process event of type '${eventName}' with data ${JSON.stringify(event)} after 5 attempts.`);
                            yield this._logger.logError(error);
                        }
                        finally {
                            if (failed && this._isDisposed)
                                return;
                            this.track(eventId);
                            yield this.incrementConsumerPartitionReadIndex();
                            if (profiler) {
                                this._eventCount++;
                                profiler.trace("Event processed");
                                this._eventsProcessingTime += profiler.traces[1].diffMs;
                            }
                        }
                    }
                }
                catch (error) {
                    yield this._logger.logWarning(`Error in consumer => ConsumerGroupId: ${this._manager.consumerGroupId}; Topic: ${this._topic}; Partition: ${this._partition};`);
                    yield this._logger.logError(error);
                    if (this._isDisposed)
                        return;
                    yield n_util_1.Delay.minutes(1);
                }
            }
        });
    }
    getPartitionWriteIndex() {
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
    getConsumerPartitionReadIndex() {
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
    incrementConsumerPartitionReadIndex() {
        const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${this._manager.consumerGroupId}-read-index`;
        return new Promise((resolve, reject) => {
            this._client.incr(key, (err, val) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(val);
            });
        });
    }
    retrieveEvent(indexToRead) {
        return new Promise((resolve, reject) => {
            const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${indexToRead}`;
            this._client.get(key, (err, value) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(value);
            });
        });
    }
    retrieveEvents(lowerBoundIndex, upperBoundIndex) {
        return new Promise((resolve, reject) => {
            n_defensive_1.given(lowerBoundIndex, "lowerBoundIndex").ensureHasValue().ensureIsNumber();
            n_defensive_1.given(upperBoundIndex, "upperBoundIndex").ensureHasValue().ensureIsNumber();
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
    processEvent(eventName, eventRegistration, event) {
        return __awaiter(this, void 0, void 0, function* () {
            const scope = this._manager.serviceLocator.createScope();
            event.$scope = scope;
            this._onEventReceived(scope, this._topic, event);
            const handler = scope.resolve(eventRegistration.eventHandlerTypeName);
            try {
                yield handler.handle(event);
            }
            catch (error) {
                yield this._logger.logWarning(`Error in EventHandler while handling event of type '${eventName}' with data ${JSON.stringify(event.serialize())}.`);
                yield this._logger.logWarning(error);
                throw error;
            }
            finally {
                yield scope.dispose();
            }
        });
    }
    track(eventId) {
        n_defensive_1.given(eventId, "eventId").ensureHasValue().ensureIsString();
        if (this._trackedIds.length >= 500)
            this._trackedIds = this._trackedIds.skip(200);
        this._trackedIds.push(eventId);
    }
    decompressEvent(eventData) {
        return __awaiter(this, void 0, void 0, function* () {
            n_defensive_1.given(eventData, "eventData").ensureHasValue().ensureIsString();
            eventData = eventData.trim();
            if (eventData.startsWith("{"))
                return JSON.parse(eventData);
            const decompressed = yield n_util_1.Make.callbackToPromise(Zlib.brotliDecompress)(Buffer.from(eventData, "base64"), { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } });
            return JSON.parse(decompressed.toString("utf8"));
        });
    }
}
exports.Consumer = Consumer;
//# sourceMappingURL=consumer.js.map