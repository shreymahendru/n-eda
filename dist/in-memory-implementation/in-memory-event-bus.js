"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
class InMemoryEventBus {
    constructor() {
        this._isDisposed = false;
        this._onPublish = null;
    }
    publish(...events) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._isDisposed)
                throw new n_exception_1.ObjectDisposedException(this);
            n_defensive_1.given(events, "events").ensureHasValue().ensureIsArray();
            events.forEach(event => n_defensive_1.given(event, "event")
                .ensureHasValue()
                .ensureIsObject()
                .ensureHasStructure({
                id: "string",
                name: "string",
            }));
            n_defensive_1.given(this, "this").ensure(t => !!t._onPublish, "onPublish callback has not been registered");
            this._onPublish(events);
        });
    }
    onPublish(callback) {
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException(this);
        n_defensive_1.given(callback, "callback").ensureHasValue().ensureIsFunction();
        n_defensive_1.given(this, "this").ensure(t => !t._onPublish, "setting onPublish callback more than once");
        this._onPublish = callback;
    }
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._isDisposed)
                return;
            this._isDisposed = true;
            this._onPublish = null;
        });
    }
}
exports.InMemoryEventBus = InMemoryEventBus;
//# sourceMappingURL=in-memory-event-bus.js.map