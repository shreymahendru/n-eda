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
exports.Broker = void 0;
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
const scheduler_1 = require("./scheduler");
class Broker {
    constructor(consumers, processors) {
        this._isDisposed = false;
        n_defensive_1.given(consumers, "consumers").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty);
        this._consumers = consumers;
        n_defensive_1.given(processors, "processors").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty)
            .ensure(t => t.length === consumers.length, "length has to match consumers length");
        this._scheduler = new scheduler_1.Scheduler(processors);
    }
    initialize() {
        this._consumers.forEach(t => t.registerBroker(this));
        this._consumers.forEach(t => t.consume());
    }
    route(routedEvent) {
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException("Broker");
        return this._scheduler.scheduleWork(routedEvent);
    }
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            this._isDisposed = true;
            yield Promise.all(this._consumers.map(t => t.dispose()));
        });
    }
}
exports.Broker = Broker;
//# sourceMappingURL=broker.js.map