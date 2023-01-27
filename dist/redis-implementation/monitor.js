"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Monitor = void 0;
const tslib_1 = require("tslib");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
const n_util_1 = require("@nivinjoseph/n-util");
class Monitor {
    constructor(client, consumers) {
        this._consumers = new Array();
        this._indexKeys = new Array;
        this._isRunning = false;
        this._isDisposed = false;
        this._runPromise = null;
        this._delayCanceller = null;
        (0, n_defensive_1.given)(client, "client").ensureHasValue().ensureIsObject();
        this._client = client;
        (0, n_defensive_1.given)(consumers, "consumers").ensureHasValue().ensureIsArray().ensureIsNotEmpty();
        consumers.forEach(consumer => {
            this._consumers.push(consumer);
            this._indexKeys.push(consumer.writeIndexKey, consumer.readIndexKey);
        });
    }
    start() {
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException("Monitor");
        if (this._isRunning)
            return;
        this._isRunning = true;
        this._runPromise = this._run();
    }
    dispose() {
        var _a;
        this._isRunning = false;
        this._isDisposed = true;
        if (this._delayCanceller != null)
            this._delayCanceller.cancel();
        return (_a = this._runPromise) !== null && _a !== void 0 ? _a : Promise.resolve();
    }
    _run() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            while (this._isRunning) {
                const values = yield this._fetchPartitionWriteAndConsumerPartitionReadIndexes();
                if (values.length % 2 !== 0 || values.length / 2 !== this._consumers.length)
                    throw new n_exception_1.ApplicationException("Monitor index values count is not valid");
                for (let i = 0; i < values.length; i += 2) {
                    const writeIndex = values[i];
                    const readIndex = values[i + 1];
                    if (readIndex >= writeIndex)
                        continue;
                    const consumer = this._consumers[i / 2];
                    consumer.awaken();
                }
                this._delayCanceller = {};
                yield n_util_1.Delay.milliseconds(n_util_1.Make.randomInt(80, 120), this._delayCanceller);
            }
        });
    }
    _fetchPartitionWriteAndConsumerPartitionReadIndexes() {
        return new Promise((resolve, reject) => {
            this._client.mget(...this._indexKeys, (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }
                const values = results.map(value => value != null ? JSON.parse(value) : 0);
                resolve(values);
            }).catch(e => reject(e));
        });
    }
}
exports.Monitor = Monitor;
//# sourceMappingURL=monitor.js.map