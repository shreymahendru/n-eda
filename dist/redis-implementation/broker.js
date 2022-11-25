"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Broker = void 0;
const tslib_1 = require("tslib");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
// import { DefaultScheduler } from "./default-scheduler";
const optimized_scheduler_1 = require("./optimized-scheduler");
class Broker {
    constructor(consumers, processors) {
        this._isDisposed = false;
        (0, n_defensive_1.given)(consumers, "consumers").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty);
        this._consumers = consumers;
        (0, n_defensive_1.given)(processors, "processors").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty)
            .ensure(t => t.length === consumers.length, "length has to match consumers length");
        this._scheduler = new optimized_scheduler_1.OptimizedScheduler(processors);
    }
    initialize() {
        this._consumers.forEach(t => t.registerBroker(this));
        this._consumers.forEach(t => t.consume());
    }
    route(routedEvent) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this._isDisposed)
                throw new n_exception_1.ObjectDisposedException("Broker");
            yield this._scheduler.scheduleWork(routedEvent);
        });
    }
    dispose() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this._isDisposed = true;
            yield Promise.all(this._consumers.map(t => t.dispose()));
        });
    }
}
exports.Broker = Broker;
//# sourceMappingURL=broker.js.map