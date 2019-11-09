"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
require("@nivinjoseph/n-ext");
exports.eventSymbol = Symbol("eventName");
function event(eventType) {
    n_defensive_1.given(eventType, "eventType").ensureHasValue().ensureIsFunction();
    return (target) => Reflect.defineMetadata(exports.eventSymbol, eventType, target);
}
exports.event = event;
//# sourceMappingURL=event.js.map