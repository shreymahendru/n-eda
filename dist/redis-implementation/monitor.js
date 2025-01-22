"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Monitor = void 0;
const tslib_1 = require("tslib");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
class Monitor {
    constructor(client, consumers, logger) {
        this._consumers = new Map();
        this._isRunning = false;
        this._isDisposed = false;
        (0, n_defensive_1.given)(client, "client").ensureHasValue().ensureIsObject();
        this._client = client.duplicate();
        (0, n_defensive_1.given)(consumers, "consumers").ensureHasValue().ensureIsArray().ensureIsNotEmpty();
        consumers.forEach(consumer => {
            this._consumers.set(consumer.id, consumer);
        });
        (0, n_defensive_1.given)(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;
        this._listener = (_channel, id) => {
            // console.log(_channel, id);
            this._consumers.get(id).awaken();
        };
    }
    start() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this._isDisposed)
                throw new n_exception_1.ObjectDisposedException("Monitor");
            if (this._isRunning)
                return;
            this._isRunning = true;
            yield this._client.subscribe(...[...this._consumers.values()].map(t => `${t.id}-changed`));
            this._client.on("message", this._listener);
        });
    }
    dispose() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this._isRunning = false;
            if (this._isDisposed)
                return;
            this._isDisposed = true;
            this._client.off("message", this._listener);
            yield this._client.unsubscribe(...[...this._consumers.values()].map(t => `${t.id}-changed`));
            yield this._client.quit();
        });
    }
}
exports.Monitor = Monitor;
//# sourceMappingURL=monitor.js.map