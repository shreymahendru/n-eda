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
        this._defaultDelayMS = 20;
        this._isDisposed = false;
        this._trackedIdsSet = new Set();
        this._trackedIdsArray = new Array();
        this._trackedKeysArray = new Array();
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
        this._cleanKeys = this._manager.cleanKeys;
        n_defensive_1.given(onEventReceived, "onEventReceived").ensureHasValue().ensureIsFunction();
        this._onEventReceived = onEventReceived;
    }
    get manager() { return this._manager; }
    get topic() { return this._topic; }
    get partition() { return this._partition; }
    get logger() { return this._logger; }
    get trackedIdsSet() { return this._trackedIdsSet; }
    get isDisposed() { return this._isDisposed; }
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
                if (this.isDisposed)
                    return;
                try {
                    const writeIndex = yield this.fetchPartitionWriteIndex();
                    const readIndex = yield this.fetchConsumerPartitionReadIndex();
                    if (readIndex >= writeIndex) {
                        yield n_util_1.Delay.milliseconds(this._defaultDelayMS);
                        continue;
                    }
                    const maxRead = 50;
                    const lowerBoundReadIndex = readIndex + 1;
                    const upperBoundReadIndex = (writeIndex - readIndex) > maxRead ? (readIndex + maxRead - 1) : writeIndex;
                    const eventsData = yield this.batchRetrieveEvents(lowerBoundReadIndex, upperBoundReadIndex);
                    for (const item of eventsData) {
                        if (this.isDisposed)
                            return;
                        let eventData = item.value;
                        let numReadAttempts = 1;
                        const maxReadAttempts = 500; // the math here must correlate with the write attempts of the producer
                        while (eventData == null && numReadAttempts < maxReadAttempts) // we need to do this to deal with race condition
                         {
                            if (this.isDisposed)
                                return;
                            yield n_util_1.Delay.milliseconds(this._defaultDelayMS);
                            eventData = yield this.retrieveEvent(item.key);
                            numReadAttempts++;
                        }
                        if (eventData == null) {
                            try {
                                throw new n_exception_1.ApplicationException(`Failed to read event data after ${maxReadAttempts} read attempts => Topic=${this.topic}; Partition=${this.partition}; ReadIndex=${item.index};`);
                            }
                            catch (error) {
                                yield this.logger.logError(error);
                            }
                            yield this.incrementConsumerPartitionReadIndex();
                            continue;
                        }
                        const event = yield this.decompressEvent(eventData);
                        const eventId = event.$id || event.id; // for compatibility with n-domain DomainEvent
                        const eventName = event.$name || event.name; // for compatibility with n-domain DomainEvent
                        const eventRegistration = this.manager.eventMap.get(eventName);
                        // const deserializedEvent = (<any>eventRegistration.eventType).deserializeEvent(event);
                        const deserializedEvent = n_util_1.Deserializer.deserialize(event);
                        if (this.trackedIdsSet.has(eventId)) {
                            yield this.incrementConsumerPartitionReadIndex();
                            continue;
                        }
                        let failed = false;
                        try {
                            const maxProcessAttempts = 10;
                            let numProcessAttempts = 0;
                            let successful = false;
                            while (successful === false && numProcessAttempts < maxProcessAttempts) {
                                if (this.isDisposed) {
                                    failed = true;
                                    break;
                                }
                                numProcessAttempts++;
                                try {
                                    yield this.processEvent(eventName, eventRegistration, deserializedEvent, eventId, numProcessAttempts);
                                    successful = true;
                                }
                                catch (error) {
                                    if (numProcessAttempts >= maxProcessAttempts)
                                        throw error;
                                    else
                                        yield n_util_1.Delay.milliseconds(100 * numProcessAttempts);
                                }
                            }
                            // await Make.retryWithExponentialBackoff(async () =>
                            // {
                            //     if (this.isDisposed)
                            //     {
                            //         failed = true;
                            //         return;
                            //     }
                            //     await this.processEvent(eventName, eventRegistration, deserializedEvent, eventId);
                            // }, 5)();
                        }
                        catch (error) {
                            failed = true;
                            yield this.logger.logWarning(`Failed to process event of type '${eventName}' with data ${JSON.stringify(event)} after 5 attempts.`);
                            yield this.logger.logError(error);
                        }
                        finally {
                            if (failed && this.isDisposed)
                                return;
                            yield this.track(eventId, item.key);
                            yield this.incrementConsumerPartitionReadIndex();
                        }
                    }
                }
                catch (error) {
                    yield this.logger.logWarning(`Error in consumer => ConsumerGroupId: ${this.manager.consumerGroupId}; Topic: ${this.topic}; Partition: ${this.partition};`);
                    yield this.logger.logError(error);
                    if (this.isDisposed)
                        return;
                    yield n_util_1.Delay.seconds(5);
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
    retrieveEvent(key) {
        return new Promise((resolve, reject) => {
            // const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${indexToRead}`;
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
            // given(lowerBoundIndex, "lowerBoundIndex").ensureHasValue().ensureIsNumber();
            // given(upperBoundIndex, "upperBoundIndex").ensureHasValue().ensureIsNumber();
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
    processEvent(eventName, eventRegistration, event, eventId, numAttempt) {
        return __awaiter(this, void 0, void 0, function* () {
            const scope = this._manager.serviceLocator.createScope();
            event.$scope = scope;
            this._onEventReceived(scope, this._topic, event);
            const handler = scope.resolve(eventRegistration.eventHandlerTypeName);
            try {
                yield handler.handle(event);
                yield this._logger.logInfo(`Executed EventHandler '${eventRegistration.eventHandlerTypeName}' for event '${eventName}' with id '${eventId}' => ConsumerGroupId: ${this.manager.consumerGroupId}; Topic: ${this.topic}; Partition: ${this.partition};`);
            }
            catch (error) {
                yield this._logger.logWarning(`Error in EventHandler while handling event of type '${eventName}' (ATTEMPT = ${numAttempt}) with data ${JSON.stringify(event.serialize())}.`);
                yield this._logger.logWarning(error);
                throw error;
            }
            finally {
                yield scope.dispose();
            }
        });
    }
    track(eventId, eventKey) {
        return __awaiter(this, void 0, void 0, function* () {
            // given(eventId, "eventId").ensureHasValue().ensureIsString();
            // given(eventKey, "eventKey").ensureHasValue().ensureIsString();
            if (this._trackedIdsArray.length >= 300) {
                this._trackedIdsArray = this._trackedIdsArray.skip(200);
                this._trackedIdsSet = new Set(this._trackedIdsArray);
                if (this._cleanKeys) {
                    const erasedKeys = this._trackedKeysArray.take(200);
                    this._trackedKeysArray = this._trackedKeysArray.skip(200);
                    yield this.removeKeys(erasedKeys);
                }
            }
            this._trackedIdsArray.push(eventId);
            this._trackedIdsSet.add(eventId);
            if (this._cleanKeys)
                this._trackedKeysArray.push(eventKey);
        });
    }
    decompressEvent(eventData) {
        return __awaiter(this, void 0, void 0, function* () {
            // given(eventData, "eventData").ensureHasValue();
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