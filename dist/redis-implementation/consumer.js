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
const consumer_profiler_1 = require("./consumer-profiler");
class Consumer {
    constructor(client, manager, topic, partition, onEventReceived) {
        this._edaPrefix = "n-eda";
        this._isDisposed = false;
        this._trackedIdsSet = new Set();
        this._trackedIdsArray = new Array();
        this._consumePromise = null;
        n_defensive_1.given(client, "client").ensureHasValue().ensureIsObject();
        this._client = client;
        n_defensive_1.given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager);
        this._manager = manager;
        this._logger = this._manager.serviceLocator.resolve("Logger");
        this._profiler = new consumer_profiler_1.ConsumerProfiler(this._manager.metricsEnabled);
        n_defensive_1.given(topic, "topic").ensureHasValue().ensureIsString();
        this._topic = topic;
        n_defensive_1.given(partition, "partition").ensureHasValue().ensureIsNumber();
        this._partition = partition;
        n_defensive_1.given(onEventReceived, "onEventReceived").ensureHasValue().ensureIsFunction();
        this._onEventReceived = onEventReceived;
    }
    get profiler() { return this._profiler; }
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
                    this._profiler.fetchPartitionWriteIndexStarted();
                    const writeIndex = yield this.fetchPartitionWriteIndex();
                    this._profiler.fetchPartitionWriteIndexEnded();
                    this._profiler.fetchConsumerPartitionReadIndexStarted();
                    const readIndex = yield this.fetchConsumerPartitionReadIndex();
                    this._profiler.fetchConsumerPartitionReadIndexEnded();
                    if (readIndex >= writeIndex) {
                        yield n_util_1.Delay.seconds(1);
                        continue;
                    }
                    const maxRead = 50;
                    const lowerBoundReadIndex = readIndex + 1;
                    const upperBoundReadIndex = (writeIndex - readIndex) > maxRead ? readIndex + maxRead : writeIndex;
                    this._profiler.batchRetrieveEventsStarted();
                    const eventsData = yield this.batchRetrieveEvents(lowerBoundReadIndex, upperBoundReadIndex);
                    this._profiler.batchRetrieveEventsEnded();
                    for (const item of eventsData) {
                        if (this._isDisposed)
                            return;
                        let eventData = item.value;
                        let numReadAttempts = 1;
                        const maxReadAttempts = 10;
                        while (eventData == null && numReadAttempts < maxReadAttempts) {
                            if (this._isDisposed)
                                return;
                            yield n_util_1.Delay.milliseconds(100);
                            this._profiler.retrieveEventStarted();
                            eventData = yield this.retrieveEvent(item.index);
                            this._profiler.retrieveEventEnded();
                            numReadAttempts++;
                        }
                        if (eventData == null) {
                            try {
                                throw new n_exception_1.ApplicationException(`Failed to read event data after ${maxReadAttempts} read attempts => Topic=${this._topic}; Partition=${this._partition}; ReadIndex=${item.index};`);
                            }
                            catch (error) {
                                yield this._logger.logError(error);
                            }
                            this._profiler.incrementConsumerPartitionReadIndexStarted();
                            yield this.incrementConsumerPartitionReadIndex();
                            this._profiler.incrementConsumerPartitionReadIndexEnded();
                            continue;
                        }
                        this._profiler.decompressEventStarted();
                        const event = yield this.decompressEvent(eventData);
                        this._profiler.decompressEventEnded();
                        const eventId = event.$id || event.id;
                        const eventName = event.$name || event.name;
                        const eventRegistration = this._manager.eventMap.get(eventName);
                        this._profiler.deserializeEventStarted();
                        const deserializedEvent = n_util_1.Deserializer.deserialize(event);
                        this._profiler.deserializeEventEnded();
                        if (this._trackedIdsSet.has(eventId)) {
                            this._profiler.incrementConsumerPartitionReadIndexStarted();
                            yield this.incrementConsumerPartitionReadIndex();
                            this._profiler.incrementConsumerPartitionReadIndexEnded();
                            continue;
                        }
                        let failed = false;
                        try {
                            this._profiler.eventProcessingStarted(eventName, eventId);
                            yield n_util_1.Make.retryWithExponentialBackoff(() => __awaiter(this, void 0, void 0, function* () {
                                if (this._isDisposed) {
                                    failed = true;
                                    return;
                                }
                                try {
                                    yield this.processEvent(eventName, eventRegistration, deserializedEvent);
                                }
                                catch (error) {
                                    this._profiler.eventRetried(eventName);
                                    throw error;
                                }
                            }), 5)();
                            this._profiler.eventProcessingEnded(eventName, eventId);
                        }
                        catch (error) {
                            failed = true;
                            this._profiler.eventFailed(eventName);
                            yield this._logger.logWarning(`Failed to process event of type '${eventName}' with data ${JSON.stringify(event)} after 5 attempts.`);
                            yield this._logger.logError(error);
                        }
                        finally {
                            if (failed && this._isDisposed)
                                return;
                            this.track(eventId);
                            this._profiler.incrementConsumerPartitionReadIndexStarted();
                            yield this.incrementConsumerPartitionReadIndex();
                            this._profiler.incrementConsumerPartitionReadIndexEnded();
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
    fetchPartitionWriteIndex() {
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
    fetchConsumerPartitionReadIndex() {
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
    batchRetrieveEvents(lowerBoundIndex, upperBoundIndex) {
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
        if (this._trackedIdsArray.length >= 300) {
            this._trackedIdsArray = this._trackedIdsArray.skip(200);
            this._trackedIdsSet = new Set(this._trackedIdsArray);
        }
        this._trackedIdsArray.push(eventId);
        this._trackedIdsSet.add(eventId);
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