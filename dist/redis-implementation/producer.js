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
// import * as Zlib from "zlib";
const MessagePack = require("msgpackr");
const Snappy = require("snappy");
class Producer {
    constructor(client, logger, topic, ttlMinutes, partition) {
        this._edaPrefix = "n-eda";
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
    }
    produce(...events) {
        return __awaiter(this, void 0, void 0, function* () {
            n_defensive_1.given(events, "events").ensureHasValue().ensureIsArray();
            if (events.isEmpty)
                return;
            const indexed = yield events.mapAsync((t) => __awaiter(this, void 0, void 0, function* () {
                return ({
                    event: t,
                    compressed: yield this._compressEvent(t.serialize())
                });
            }));
            for (const item of indexed) {
                try {
                    const writeIndex = yield n_util_1.Make.retryWithExponentialBackoff(() => this._incrementPartitionWriteIndex(), 5)();
                    yield n_util_1.Make.retryWithExponentialBackoff(() => this._storeEvent(writeIndex, item.compressed), 5)();
                }
                catch (error) {
                    yield this._logger.logWarning(`Error while storing event of type ${item.event.name}  => Topic: ${this._topic}; Partition: ${this._partition};`);
                    yield this._logger.logError(error);
                    throw error;
                }
            }
        });
    }
    // private async _compressEvent(event: object): Promise<Buffer>
    // {
    //     given(event, "event").ensureHasValue().ensureIsObject();
    //     const compressed = await Make.callbackToPromise<Buffer>(Zlib.brotliCompress)(Buffer.from(JSON.stringify(event), "utf8"),
    //         { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } });
    //     return compressed;
    // }
    _compressEvent(event) {
        return __awaiter(this, void 0, void 0, function* () {
            const compressed = yield Snappy.compress(MessagePack.pack(event));
            return compressed;
        });
    }
    _incrementPartitionWriteIndex() {
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
    _storeEvent(writeIndex, eventData) {
        return new Promise((resolve, reject) => {
            n_defensive_1.given(writeIndex, "writeIndex").ensureHasValue().ensureIsNumber();
            n_defensive_1.given(eventData, "eventData").ensureHasValue();
            const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${writeIndex}`;
            // const expirySeconds = 60 * 60 * 4;
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
// export class Producer
// {
//     private readonly _edaPrefix = "n-eda";
//     private readonly _client: Redis.RedisClient;
//     private readonly _logger: Logger;
//     private readonly _topic: string;
//     private readonly _ttlMinutes: number;
//     private readonly _partition: number;
//     private readonly _mutex = new Mutex();
//     public constructor(client: Redis.RedisClient, logger: Logger, topic: string, ttlMinutes: number,
//         partition: number)
//     {
//         given(client, "client").ensureHasValue().ensureIsObject();
//         this._client = client;
//         given(logger, "logger").ensureHasValue().ensureIsObject();
//         this._logger = logger;
//         given(topic, "topic").ensureHasValue().ensureIsString();
//         this._topic = topic;
//         given(ttlMinutes, "ttlMinutes").ensureHasValue().ensureIsNumber();
//         this._ttlMinutes = ttlMinutes;
//         given(partition, "partition").ensureHasValue().ensureIsNumber();
//         this._partition = partition;
//     }
//     public async produce(...events: ReadonlyArray<EdaEvent>): Promise<void>
//     {
//         given(events, "events").ensureHasValue().ensureIsArray();
//         if (events.isEmpty)
//             return;
//         const indexed = await events.mapAsync(async (t) => ({
//             index: 0,
//             event: t,
//             compressed: await this.compressEvent((t).serialize())
//         }));
//         const upperBoundWriteIndex = await this.acquireWriteIndex(events.length);
//         const lowerBoundWriteIndex = upperBoundWriteIndex - events.length;
//         for (let i = 0; i < events.length; i++)
//             indexed[i].index = lowerBoundWriteIndex + i + 1;
//         await indexed.forEachAsync(async (t) =>
//         {
//             const maxStoreAttempts = 500; // correlates with read attempts in consumer
//             let numStoreAttempts = 0;
//             let stored = false;
//             while (stored === false && numStoreAttempts < maxStoreAttempts)
//             {
//                 numStoreAttempts++;
//                 try 
//                 {
//                     await this.storeEvent(t.index, t.compressed);
//                     stored = true;
//                 }
//                 catch (error)
//                 {
//                     await this._logger.logWarning(`Error while storing event of type ${t.event.name} (ATTEMPT = ${numStoreAttempts}) => Topic: ${this._topic}; Partition: ${this._partition}; WriteIndex: ${t.index};`);
//                     await this._logger.logError(error);
//                     if (numStoreAttempts >= maxStoreAttempts)
//                         throw error;
//                     else
//                         await Delay.milliseconds(20);
//                 }
//             }
//             // await Make.retryWithDelay(async () =>
//             // {
//             //     try 
//             //     {
//             //         await this.storeEvent(t.index, t.compressed);
//             //     }
//             //     catch (error)
//             //     {
//             //         await this._logger.logWarning(`Error while storing event of type ${t.event.name} => Topic: ${this._topic}; Partition: ${this._partition}; WriteIndex: ${t.index};`);
//             //         await this._logger.logError(error);
//             //         throw error;
//             //     }
//             // }, 20, 500)();
//         });
//     }
//     private async compressEvent(event: object): Promise<Buffer>
//     {
//         given(event, "event").ensureHasValue().ensureIsObject();
//         const compressed = await Make.callbackToPromise<Buffer>(Zlib.brotliCompress)(Buffer.from(JSON.stringify(event), "utf8"),
//             { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } });
//         return compressed;
//     }
//     // @ts-ignore
//     private async acquireWriteIndex(incrBy: number): Promise<number>
//     {
//         await this._mutex.lock();
//         try
//         {
//             const maxAttempts = 20;
//             let numAttempts = 0;
//             while (numAttempts < maxAttempts)
//             {
//                 numAttempts++;
//                 try 
//                 {
//                     return await this.incrementPartitionWriteIndex(incrBy);
//                 }
//                 catch (error)
//                 {
//                     await this._logger.logWarning(`Error while incrementing partition write index (ATTEMPT = ${numAttempts}) => Topic: ${this._topic}; Partition: ${this._partition};`);
//                     await this._logger.logError(error);
//                     if (numAttempts >= maxAttempts)
//                         throw error;
//                     else
//                         await Delay.milliseconds(500);
//                 }
//             }
//         }
//         finally
//         {
//             this._mutex.release();
//         }
//     }
//     private incrementPartitionWriteIndex(incrBy: number): Promise<number>
//     {
//         return new Promise((resolve, reject) =>
//         {
//             given(incrBy, "incrBy").ensureHasValue().ensureIsNumber().ensure(t => t > 0, "has to be > 0");
//             const key = `${this._edaPrefix}-${this._topic}-${this._partition}-write-index`;
//             this._client.incrby(key, incrBy, (err, val) =>
//             {
//                 if (err)
//                 {
//                     reject(err);
//                     return;
//                 }
//                 resolve(val);
//             });
//         });
//     }
//     private storeEvent(writeIndex: number, eventData: string | Buffer): Promise<void>
//     {
//         return new Promise((resolve, reject) =>
//         {
//             given(writeIndex, "writeIndex").ensureHasValue().ensureIsNumber();
//             given(eventData, "eventData").ensureHasValue();
//             const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${writeIndex}`;
//             // const expirySeconds = 60 * 60 * 4;
//             const expirySeconds = this._ttlMinutes * 60;
//             this._client.setex(key.trim(), expirySeconds, eventData as any, (err) =>
//             {
//                 if (err)
//                 {
//                     reject(err);
//                     return;
//                 }
//                 resolve();
//             });
//         });
//     }
// }
//# sourceMappingURL=producer.js.map