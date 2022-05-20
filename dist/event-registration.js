"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventRegistration = void 0;
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const event_1 = require("./event");
// public
class EventRegistration {
    constructor(eventHandlerType) {
        (0, n_defensive_1.given)(eventHandlerType, "eventHandlerType").ensureHasValue().ensureIsFunction()
            .ensure(t => Reflect.hasOwnMetadata(event_1.eventSymbol, t), `EventHandler '${eventHandlerType.getTypeName()}' does not have event applied.`);
        this._eventHandlerTypeName = eventHandlerType.getTypeName();
        this._eventHandlerType = eventHandlerType;
        this._eventType = Reflect.getOwnMetadata(event_1.eventSymbol, this._eventHandlerType);
        this._eventTypeName = this._eventType.getTypeName();
        // let eventTypeName: string = Reflect.getOwnMetadata(eventSymbol, this._eventHandlerType);
        // eventTypeName = eventTypeName.trim();
        // if (eventTypeName.endsWith("*"))
        // {
        //     eventTypeName = eventTypeName.substr(0, eventTypeName.length - 1);
        //     this._isWild = true;
        // }
        // else
        // {
        //     this._isWild = false;
        // }
        // this._eventTypeName = eventTypeName.trim();
    }
    get eventType() { return this._eventType; }
    get eventTypeName() { return this._eventTypeName; }
    get eventHandlerTypeName() { return this._eventHandlerTypeName; }
    get eventHandlerType() { return this._eventHandlerType; }
}
exports.EventRegistration = EventRegistration;
//# sourceMappingURL=event-registration.js.map