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
class InMemoryEventBus {
    constructor() {
        this._onPublish = null;
    }
    publish(event) {
        return __awaiter(this, void 0, void 0, function* () {
            n_defensive_1.given(event, "event").ensureHasValue()
                .ensureHasStructure({
                id: "string",
                name: "string",
            });
            n_defensive_1.given(this, "this").ensure(t => !!t._onPublish, "onPublish callback has not been registered");
            this._onPublish(event);
        });
    }
    onPublish(callback) {
        n_defensive_1.given(callback, "callback").ensureHasValue().ensureIsFunction();
        n_defensive_1.given(this, "this").ensure(t => !t._onPublish, "setting onPublish callback more than once");
        this._onPublish = callback;
    }
}
exports.InMemoryEventBus = InMemoryEventBus;
//# sourceMappingURL=in-memory-event-bus.js.map