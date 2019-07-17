"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
const event_1 = require("./event");
class EventRegistration {
    get eventTypeName() { return this._eventTypeName; }
    get eventHandlerTypeName() { return this._eventHandlerTypeName; }
    get eventHandlerType() { return this._eventHandlerType; }
    get isWild() { return this._isWild; }
    constructor(eventHandlerType) {
        n_defensive_1.given(eventHandlerType, "eventHandlerType").ensureHasValue().ensureIsFunction();
        this._eventHandlerTypeName = eventHandlerType.getTypeName();
        this._eventHandlerType = eventHandlerType;
        if (!Reflect.hasOwnMetadata(event_1.eventSymbol, this._eventHandlerType))
            throw new n_exception_1.ApplicationException("EventHandler '{0}' does not have event applied."
                .format(this._eventHandlerTypeName));
        let eventTypeName = Reflect.getOwnMetadata(event_1.eventSymbol, this._eventHandlerType);
        eventTypeName = eventTypeName.trim();
        if (eventTypeName.endsWith("*")) {
            eventTypeName = eventTypeName.substr(0, eventTypeName.length - 1);
            this._isWild = true;
        }
        else {
            this._isWild = false;
        }
        this._eventTypeName = eventTypeName.trim();
    }
}
exports.EventRegistration = EventRegistration;
//# sourceMappingURL=event-registration.js.map