"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
require("@nivinjoseph/n-ext");
const n_exception_1 = require("@nivinjoseph/n-exception");
exports.eventSymbol = Symbol("eventName");
function event(eventType) {
    n_defensive_1.given(eventType, "eventType").ensureHasValue();
    let eventName = null;
    if (typeof eventType === "string")
        eventName = eventType.trim();
    else if (typeof eventType === "function")
        eventName = eventType.getTypeName();
    else
        throw new n_exception_1.ArgumentException("eventType", "must be an event class(Function) or event class name(string)");
    return (target) => Reflect.defineMetadata(exports.eventSymbol, eventName, target);
}
exports.event = event;
//# sourceMappingURL=event.js.map