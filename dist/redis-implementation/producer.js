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
exports.Producer = void 0;
const n_util_1 = require("@nivinjoseph/n-util");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const Zlib = require("zlib");
class Producer {
    constructor(client, logger, topic, ttlMinutes, partition, compress) {
        this._edaPrefix = "n-eda";
        this._mutex = new n_util_1.Mutex();
        n_defensive_1.given(client, "client").ensureHasValue().ensureIsObject();
        this._client = client;
        n_defensive_1.given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;
        n_defensive_1.given(topic, "topic").ensureHasValue().ensureIsString();
        this._topic = topic;
        n_defensive_1.given(ttlMinutes, "ttlMinutes").ensureHasValue().ensureIsNumber();
        this._ttlMinutes = ttlMinutes;
        n_defensive_1.given(partition, "partition").ensureHasValue().ensureIsNumber();
        this._partition = partition;
        n_defensive_1.given(compress, "compress").ensureHasValue().ensureIsBoolean();
        this._compress = compress;
    }
    produce(event) {
        return __awaiter(this, void 0, void 0, function* () {
            n_defensive_1.given(event, "event").ensureHasValue().ensureIsObject()
                .ensureHasStructure({
                id: "string",
                name: "string"
            });
            const compressedEvent = yield this.compressEvent(event.serialize());
            const writeIndex = yield this.acquireWriteIndex();
            yield n_util_1.Make.retryWithDelay(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    yield this.storeEvent(writeIndex, compressedEvent);
                }
                catch (error) {
                    yield this._logger.logWarning(`Error while storing event of type ${event.name} => Topic: ${this._topic}; Partition: ${this._partition}; WriteIndex: ${writeIndex};`);
                    yield this._logger.logError(error);
                    throw error;
                }
            }), 20, 1000)();
        });
    }
    compressEvent(event) {
        return __awaiter(this, void 0, void 0, function* () {
            n_defensive_1.given(event, "event").ensureHasValue().ensureIsObject();
            if (!this._compress)
                return JSON.stringify(event);
            const compressed = yield n_util_1.Make.callbackToPromise(Zlib.brotliCompress)(Buffer.from(JSON.stringify(event), "utf8"), { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } });
            return compressed.toString("base64");
        });
    }
    acquireWriteIndex() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._mutex.lock();
            try {
                return yield n_util_1.Make.retryWithDelay(() => __awaiter(this, void 0, void 0, function* () {
                    try {
                        return yield this.incrementPartitionWriteIndex();
                    }
                    catch (error) {
                        yield this._logger.logWarning(`Error while incrementing partition write index => Topic: ${this._topic}; Partition: ${this._partition};`);
                        yield this._logger.logError(error);
                        throw error;
                    }
                }), 20, 1000)();
            }
            finally {
                this._mutex.release();
            }
        });
    }
    incrementPartitionWriteIndex() {
        return new Promise((resolve, reject) => {
            const key = `${this._edaPrefix}-${this._topic}-${this._partition}-write-index`;
            this._client.incr(key, (err, val) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(val);
            });
        });
    }
    storeEvent(writeIndex, eventData) {
        return new Promise((resolve, reject) => {
            n_defensive_1.given(writeIndex, "writeIndex").ensureHasValue().ensureIsNumber();
            n_defensive_1.given(eventData, "eventData").ensureHasValue().ensureIsString();
            const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${writeIndex}`;
            const expirySeconds = this._ttlMinutes * 60;
            this._client.setex(key.trim(), expirySeconds, eventData, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }
}
exports.Producer = Producer;
//# sourceMappingURL=producer.js.map