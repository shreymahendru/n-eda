"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.event = exports.eventSymbol = void 0;
require("reflect-metadata");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
require("@nivinjoseph/n-ext");
// import { ArgumentException } from "@nivinjoseph/n-exception";
exports.eventSymbol = Symbol("eventName");
// public
function event(eventType) {
    n_defensive_1.given(eventType, "eventType").ensureHasValue().ensureIsFunction();
    // let eventName: string | null = null;
    // if (typeof eventType === "string")
    //     eventName = eventType.trim();
    // else if (typeof eventType === "function")
    //     eventName = (<Object>eventType).getTypeName();
    // else
    //     throw new ArgumentException("eventType", "must be an event class(Function) or event class name(string)");
    return (target) => Reflect.defineMetadata(exports.eventSymbol, eventType, target);
}
exports.event = event;
//# sourceMappingURL=event.js.map