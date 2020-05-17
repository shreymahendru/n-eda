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
exports.InMemoryEventBus = void 0;
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
const eda_manager_1 = require("../eda-manager");
class InMemoryEventBus {
    constructor() {
        this._isDisposed = false;
        this._onPublish = null;
        this._manager = null;
    }
    initialize(manager) {
        n_defensive_1.given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager);
        n_defensive_1.given(this, "this").ensure(t => !t._manager, "already initialized");
        this._manager = manager;
    }
    publish(topic, event) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._isDisposed)
                throw new n_exception_1.ObjectDisposedException(this);
            n_defensive_1.given(this, "this")
                .ensure(t => !!t._manager, "not initialized")
                .ensure(t => !!t._onPublish, "onPublish callback has not been registered");
            n_defensive_1.given(topic, "topic").ensureHasValue().ensureIsString()
                .ensure(t => this._manager.topics.some(u => u.name === t));
            n_defensive_1.given(event, "event").ensureHasValue().ensureIsObject()
                .ensureHasStructure({
                id: "string",
                name: "string",
            });
            if (!this._manager.eventMap.has(event.name))
                return;
            this._onPublish(topic, this._manager.mapToPartition(topic, event), event);
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