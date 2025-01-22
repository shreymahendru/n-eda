"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.observer = exports.observerSymbol = exports.observable = exports.observableSymbol = exports.observedEvent = exports.observedEventSymbol = void 0;
require("reflect-metadata");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
require("@nivinjoseph/n-ext");
// import { ArgumentException } from "@nivinjoseph/n-exception";
exports.observedEventSymbol = Symbol.for("@nivinjoseph/n-eda/observedEvent");
// public
function observedEvent(eventType) {
    (0, n_defensive_1.given)(eventType, "eventType").ensureHasValue().ensureIsFunction();
    return (target) => Reflect.defineMetadata(exports.observedEventSymbol, eventType, target);
}
exports.observedEvent = observedEvent;
exports.observableSymbol = Symbol.for("@nivinjoseph/n-eda/observable");
// public
function observable(type) {
    (0, n_defensive_1.given)(type, "type").ensureHasValue().ensureIsFunction();
    return (target) => Reflect.defineMetadata(exports.observableSymbol, type, target);
}
exports.observable = observable;
exports.observerSymbol = Symbol.for("@nivinjoseph/n-eda/observer");
// public
function observer(type) {
    (0, n_defensive_1.given)(type, "type").ensureHasValue().ensureIsFunction();
    return (target) => Reflect.defineMetadata(exports.observerSymbol, type, target);
}
exports.observer = observer;
//# sourceMappingURL=observed-event.js.map