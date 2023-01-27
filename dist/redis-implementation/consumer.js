"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Consumer = void 0;
const tslib_1 = require("tslib");
const n_util_1 = require("@nivinjoseph/n-util");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const eda_manager_1 = require("../eda-manager");
const n_exception_1 = require("@nivinjoseph/n-exception");
const Zlib = require("zlib");
const broker_1 = require("./broker");
const otelApi = require("@opentelemetry/api");
const semCon = require("@opentelemetry/semantic-conventions");
// import * as MessagePack from "msgpackr";
// import * as Snappy from "snappy";
class Consumer {
    constructor(client, manager, topic, partition, flush = false) {
        this._edaPrefix = "n-eda";
        this._isDisposed = false;
        this._maxTrackedSize = 3000;
        this._keepTrackedSize = 1000;
        this._trackedKeysArray = new Array();
        this._trackedKeysSet = new Set();
        this._keysToTrack = new Array();
        this._consumePromise = null;
        this._broker = null;
        this._delayCanceller = null;
        (0, n_defensive_1.given)(client, "client").ensureHasValue().ensureIsObject();
        this._client = client;
        (0, n_defensive_1.given)(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager);
        this._manager = manager;
        this._logger = this._manager.serviceLocator.resolve("Logger");
        (0, n_defensive_1.given)(topic, "topic").ensureHasValue().ensureIsString();
        this._topic = topic;
        (0, n_defensive_1.given)(partition, "partition").ensureHasValue().ensureIsNumber();
        this._partition = partition;
        this._cleanKeys = this._manager.cleanKeys;
        this._trackedKeysKey = `{${this._edaPrefix}-${this._topic}-${this._partition}}-tracked_keys`;
        (0, n_defensive_1.given)(flush, "flush").ensureHasValue().ensureIsBoolean();
        this._flush = flush;
    }
    get id() { return `{${this._edaPrefix}-${this._topic}-${this._partition}}`; }
    get writeIndexKey() { return `{${this._edaPrefix}-${this._topic}-${this._partition}}-write-index`; }
    get readIndexKey() { return `{${this._edaPrefix}-${this._topic}-${this._partition}}-${this._manager.consumerGroupId}-read-index`; }
    registerBroker(broker) {
        (0, n_defensive_1.given)(broker, "broker").ensureHasValue().ensureIsObject().ensureIsObject().ensureIsType(broker_1.Broker);
        this._broker = broker;
    }
    consume() {
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException("Consumer");
        (0, n_defensive_1.given)(this, "this").ensure(t => !t._consumePromise, "consumption has already commenced");
        this._consumePromise = this._beginConsume();
    }
    dispose() {
        var _a;
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._isDisposed) {
                this._isDisposed = true;
                if (this._delayCanceller != null)
                    this._delayCanceller.cancel();
                console.warn(`Disposing consumer ${this.id}`);
            }
            return ((_a = this._consumePromise) === null || _a === void 0 ? void 0 : _a.then(() => console.warn(`Consumer disposed ${this.id}`))) || Promise.resolve().then(() => console.warn(`Consumer disposed ${this.id}`));
        });
    }
    awaken() {
        if (this._delayCanceller != null)
            this._delayCanceller.cancel();
    }
    _beginConsume() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield this._loadTrackedKeys();
            yield this._logger.logInfo(`Loaded tracked keys for Consumer ${this.id} => ${this._trackedKeysSet.size}`);
            const maxReadAttempts = 50;
            // eslint-disable-next-line no-constant-condition
            while (true) {
                if (this._isDisposed)
                    return;
                try {
                    // const writeIndex = await this._fetchPartitionWriteIndex();
                    // const readIndex = await this._fetchConsumerPartitionReadIndex();
                    const [writeIndex, readIndex] = yield this._fetchPartitionWriteAndConsumerPartitionReadIndexes();
                    if (readIndex >= writeIndex) {
                        this._delayCanceller = {};
                        yield n_util_1.Delay.seconds(n_util_1.Make.randomInt(60, 120), this._delayCanceller);
                        continue;
                    }
                    const maxRead = 50;
                    const depth = writeIndex - readIndex;
                    const lowerBoundReadIndex = readIndex + 1;
                    let upperBoundReadIndex = writeIndex;
                    if (depth > maxRead) {
                        upperBoundReadIndex = readIndex + maxRead - 1;
                        yield this._logger.logWarning(`Event queue depth for ${this.id} is ${depth}.`);
                    }
                    const eventsData = yield this._batchRetrieveEvents(lowerBoundReadIndex, upperBoundReadIndex);
                    if (this._flush) {
                        yield this._incrementConsumerPartitionReadIndex(upperBoundReadIndex);
                        yield this._removeKeys(eventsData.map(t => t.key));
                        continue;
                    }
                    const routed = new Array();
                    const eventDataKeys = new Array();
                    for (const item of eventsData) {
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                        if (this._isDisposed)
                            return;
                        let eventData = item.value;
                        if (this._cleanKeys)
                            eventDataKeys.push(item.key);
                        let numReadAttempts = 1;
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                        while (eventData == null && numReadAttempts < maxReadAttempts) // we need to do this to deal with race condition
                         {
                            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                            if (this._isDisposed)
                                return;
                            yield n_util_1.Delay.milliseconds(100);
                            eventData = yield this._retrieveEvent(item.key);
                            numReadAttempts++;
                        }
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
                        const events = yield this._decompressEvents(eventData);
                        for (const event of events) {
                            const eventId = event.$id || event.id; // for compatibility with n-domain DomainEvent
                            if (this._trackedKeysSet.has(eventId))
                                continue;
                            const eventName = event.$name || event.name; // for compatibility with n-domain DomainEvent
                            const eventRegistration = this._manager.eventMap.get(eventName);
                            const deserializedEvent = n_util_1.Deserializer.deserialize(event);
                            routed.push(this._attemptRoute(eventName, eventRegistration, item.index, item.key, eventId, event, deserializedEvent));
                        }
                    }
                    yield Promise.all(routed);
                    yield this._saveTrackedKeys();
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    if (this._isDisposed)
                        return;
                    yield this._incrementConsumerPartitionReadIndex(upperBoundReadIndex);
                    if (this._cleanKeys)
                        yield this._removeKeys(eventDataKeys);
                }
                catch (error) {
                    yield this._logger.logWarning(`Error in consumer => ConsumerGroupId: ${this._manager.consumerGroupId}; Topic: ${this._topic}; Partition: ${this._partition};`);
                    yield this._logger.logError(error);
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    if (this._isDisposed)
                        return;
                    yield n_util_1.Delay.seconds(5);
                }
            }
        });
    }
    _attemptRoute(eventName, eventRegistration, eventIndex, eventKey, eventId, rawEvent, event) {
        var _a;
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const traceData = (_a = rawEvent["$traceData"]) !== null && _a !== void 0 ? _a : {};
            const parentContext = otelApi.propagation.extract(otelApi.ROOT_CONTEXT, traceData);
            const tracer = otelApi.trace.getTracer("n-eda");
            const span = tracer.startSpan(`event.${event.name} receive`, {
                kind: otelApi.SpanKind.INTERNAL,
                attributes: {
                    [semCon.SemanticAttributes.MESSAGING_SYSTEM]: "n-eda",
                    [semCon.SemanticAttributes.MESSAGING_OPERATION]: "receive",
                    [semCon.SemanticAttributes.MESSAGING_DESTINATION]: `${this._topic}+++${this._partition}`,
                    [semCon.SemanticAttributes.MESSAGING_DESTINATION_KIND]: "topic",
                    [semCon.SemanticAttributes.MESSAGING_TEMP_DESTINATION]: false,
                    [semCon.SemanticAttributes.MESSAGING_PROTOCOL]: "NEDA",
                    [semCon.SemanticAttributes.MESSAGE_ID]: event.id,
                    [semCon.SemanticAttributes.MESSAGING_CONVERSATION_ID]: event.partitionKey
                }
            }, parentContext);
            // otelApi.trace.setSpan(otelApi.context.active(), span);
            // traceData = {};
            // otelApi.propagation.inject(otelApi.trace.setSpan(otelApi.context.active(), span), traceData);
            // (<any>rawEvent)["$traceData"] = traceData;
            let brokerDisposed = false;
            try {
                yield otelApi.context.with(otelApi.trace.setSpan(otelApi.context.active(), span), () => tslib_1.__awaiter(this, void 0, void 0, function* () {
                    yield this._broker.route({
                        consumerId: this.id,
                        topic: this._topic,
                        partition: this._partition,
                        eventName,
                        eventRegistration,
                        eventIndex,
                        eventKey,
                        eventId,
                        rawEvent,
                        event,
                        partitionKey: this._manager.partitionKeyMapper(event),
                        span
                    });
                }));
            }
            catch (error) {
                span.recordException(error);
                span.setStatus({ code: otelApi.SpanStatusCode.ERROR });
                if (error instanceof n_exception_1.ObjectDisposedException)
                    brokerDisposed = true;
                // await this._logger.logWarning(`Failed to consume event of type '${eventName}' with data ${JSON.stringify(event.serialize())}`);
                // await this._logger.logError(error as Exception);
            }
            finally {
                // if (failed && this._isDisposed) // cuz it could have failed because things were disposed
                //     // eslint-disable-next-line no-unsafe-finally
                //     return;
                if (!brokerDisposed)
                    this._track(eventId);
                span.end();
            }
        });
    }
    // private _fetchPartitionWriteIndex(): Promise<number>
    // {
    //     const key = `${this._edaPrefix}-${this._topic}-${this._partition}-write-index`;
    //     return new Promise((resolve, reject) =>
    //     {
    //         this._client.get(key, (err, value) =>
    //         {
    //             if (err)
    //             {
    //                 reject(err);
    //                 return;
    //             }
    //             // console.log("fetchPartitionWriteIndex", JSON.parse(value!));
    //             resolve(value != null ? JSON.parse(value) : 0);
    //         });
    //     });
    // }
    // private _fetchConsumerPartitionReadIndex(): Promise<number>
    // {
    //     const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${this._manager.consumerGroupId}-read-index`;
    //     return new Promise((resolve, reject) =>
    //     {
    //         this._client.get(key, (err, value) =>
    //         {
    //             if (err)
    //             {
    //                 reject(err);
    //                 return;
    //             }
    //             // console.log("fetchConsumerPartitionReadIndex", JSON.parse(value!));
    //             resolve(value != null ? JSON.parse(value) : 0);
    //         });
    //     });
    // }
    _fetchPartitionWriteAndConsumerPartitionReadIndexes() {
        return new Promise((resolve, reject) => {
            this._client.mget(this.writeIndexKey, this.readIndexKey, (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                resolve(results.map(value => value != null ? JSON.parse(value) : 0));
            }).catch(e => reject(e));
        });
    }
    _incrementConsumerPartitionReadIndex(index) {
        if (index != null) {
            return new Promise((resolve, reject) => {
                this._client.set(this.readIndexKey, index.toString(), (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                }).catch(e => reject(e));
            });
        }
        return new Promise((resolve, reject) => {
            this._client.incr(this.readIndexKey, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            }).catch(e => reject(e));
        });
    }
    _retrieveEvent(key) {
        return new Promise((resolve, reject) => {
            this._client.getBuffer(key, (err, value) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(value);
            }).catch(e => reject(e));
        });
    }
    _batchRetrieveEvents(lowerBoundIndex, upperBoundIndex) {
        return new Promise((resolve, reject) => {
            const keys = new Array();
            for (let i = lowerBoundIndex; i <= upperBoundIndex; i++) {
                const key = `{${this._edaPrefix}-${this._topic}-${this._partition}}-${i}`;
                keys.push({ index: i, key });
            }
            this._client.mgetBuffer(...keys.map(t => t.key), (err, values) => {
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
            }).catch(e => reject(e));
        });
    }
    _track(eventKey) {
        this._trackedKeysSet.add(eventKey);
        this._trackedKeysArray.push(eventKey);
        this._keysToTrack.push(eventKey);
    }
    _saveTrackedKeys() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this._keysToTrack.isNotEmpty) {
                if (this._isDisposed)
                    yield this._logger.logInfo(`Saving ${this._keysToTrack.length} tracked keys in ${this.id}`);
                yield new Promise((resolve, reject) => {
                    this._client.lpush(this._trackedKeysKey, ...this._keysToTrack, (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve();
                    }).catch(e => reject(e));
                });
                if (this._isDisposed)
                    yield this._logger.logInfo(`Saved ${this._keysToTrack.length} tracked keys in ${this.id}`);
                this._keysToTrack = new Array();
            }
            if (this._isDisposed)
                return;
            if (this._trackedKeysSet.size >= this._maxTrackedSize) {
                const newTracked = this._trackedKeysArray.skip(this._maxTrackedSize - this._keepTrackedSize);
                this._trackedKeysSet = new Set(newTracked);
                this._trackedKeysArray = newTracked;
                yield this._purgeTrackedKeys();
                // await Promise.all([
                //     erasedKeys.isNotEmpty ? this._removeKeys(erasedKeys) : Promise.resolve(),
                //     this._purgeTrackedKeys()
                // ]);
            }
        });
    }
    // private async _track(eventKey: string): Promise<void>
    // {
    //     this._trackedKeysSet.add(eventKey);
    //     await this._saveTrackedKey(eventKey);
    //     if (this._trackedKeysSet.size >= 300)
    //     {
    //         const trackedKeysArray = [...this._trackedKeysSet.values()];
    //         this._trackedKeysSet = new Set<string>(trackedKeysArray.skip(200));
    //         if (this._cleanKeys)
    //         {
    //             const erasedKeys = trackedKeysArray.take(200);
    //             await this._removeKeys(erasedKeys);
    //         }
    //         await this._purgeTrackedKeys();
    //     }
    // }
    // private _saveTrackedKey(key: string): Promise<void>
    // {
    //     return new Promise((resolve, reject) =>
    //     {
    //         this._client.lpush(this._trackedKeysKey, key, (err) =>
    //         {
    //             if (err)
    //             {
    //                 reject(err);
    //                 return;
    //             }
    //             resolve();
    //         });
    //     });
    // }
    _purgeTrackedKeys() {
        return new Promise((resolve, reject) => {
            this._client.ltrim(this._trackedKeysKey, 0, this._keepTrackedSize - 1, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            }).catch(e => reject(e));
        });
    }
    // private _purgeTrackedKeys(): void
    // {
    //     this._client.ltrim(this._trackedKeysKey, 0, 1999).catch(e => this._logger.logError(e));
    // }
    _loadTrackedKeys() {
        return new Promise((resolve, reject) => {
            this._client.lrange(this._trackedKeysKey, 0, -1, (err, keys) => {
                if (err) {
                    reject(err);
                    return;
                }
                keys = keys.reverse().map(t => t.toString("utf8"));
                // console.log(keys);
                this._trackedKeysSet = new Set(keys);
                this._trackedKeysArray = keys;
                resolve();
            }).catch(e => reject(e));
        });
    }
    // private async _decompressEvent(eventData: Buffer): Promise<object>
    // { 
    //     const decompressed = await Make.callbackToPromise<Buffer>(Zlib.brotliDecompress)(eventData,
    //         { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } });
    //     return JSON.parse(decompressed.toString("utf8"));
    // }
    // private async _decompressEvent(eventData: Buffer): Promise<object>
    // {
    //     const decompressed = await Snappy.uncompress(eventData, { asBuffer: true }) as Buffer;
    //     return MessagePack.unpack(decompressed);
    // }
    _decompressEvents(eventData) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const decompressed = yield n_util_1.Make.callbackToPromise(Zlib.inflateRaw)(eventData);
            return JSON.parse(decompressed.toString("utf8"));
        });
    }
    _removeKeys(keys) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (keys.isEmpty)
                return;
            return new Promise((resolve, reject) => {
                this._client.unlink(...keys, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                }).catch(e => reject(e));
            });
        });
    }
}
exports.Consumer = Consumer;
//# sourceMappingURL=consumer.js.map