"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventRegistration = void 0;
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
const event_1 = require("./event");
class EventRegistration {
    constructor(eventHandlerType) {
        n_defensive_1.given(eventHandlerType, "eventHandlerType").ensureHasValue().ensureIsFunction();
        this._eventHandlerTypeName = eventHandlerType.getTypeName();
        this._eventHandlerType = eventHandlerType;
        if (!Reflect.hasOwnMetadata(event_1.eventSymbol, this._eventHandlerType))
            throw new n_exception_1.ApplicationException("EventHandler '{0}' does not have event applied."
                .format(this._eventHandlerTypeName));
        this._eventType = Reflect.getOwnMetadata(event_1.eventSymbol, this._eventHandlerType);
        this._eventTypeName = this._eventType.getTypeName();
    }
    get eventType() { return this._eventType; }
    get eventTypeName() { return this._eventTypeName; }
    get eventHandlerTypeName() { return this._eventHandlerTypeName; }
    get eventHandlerType() { return this._eventHandlerType; }
}
exports.EventRegistration = EventRegistration;
//# sourceMappingURL=event-registration.js.map