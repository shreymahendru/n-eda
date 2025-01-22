"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventRegistration = void 0;
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const event_1 = require("./event");
const observed_event_1 = require("./observed-event");
// public
class EventRegistration {
    constructor(eventHandlerType) {
        this._isObservedEvent = false;
        this._observableType = null;
        this._observableTypeName = null;
        this._observerType = null;
        this._observerTypeName = null;
        (0, n_defensive_1.given)(eventHandlerType, "eventHandlerType").ensureHasValue().ensureIsFunction()
            .ensure(t => Reflect.hasOwnMetadata(event_1.eventSymbol, t)
            || Reflect.hasOwnMetadata(observed_event_1.observedEventSymbol, t), `EventHandler '${eventHandlerType.getTypeName()}' does not have event or observedEvent applied.`)
            .ensure(t => !(Reflect.hasOwnMetadata(event_1.eventSymbol, t)
            && Reflect.hasOwnMetadata(observed_event_1.observedEventSymbol, t)), `EventHandler '${eventHandlerType.getTypeName()}' has both event and observedEvent applied.`);
        this._eventHandlerType = eventHandlerType;
        this._eventHandlerTypeName = eventHandlerType.getTypeName();
        if (Reflect.hasOwnMetadata(event_1.eventSymbol, eventHandlerType)) {
            this._eventType = Reflect.getOwnMetadata(event_1.eventSymbol, this._eventHandlerType);
        }
        else // observedEvent
         {
            this._eventType = Reflect.getOwnMetadata(observed_event_1.observedEventSymbol, this._eventHandlerType);
            this._isObservedEvent = true;
            (0, n_defensive_1.given)(eventHandlerType, "eventHandlerType").ensureHasValue().ensureIsFunction()
                .ensure(t => Reflect.hasOwnMetadata(observed_event_1.observableSymbol, t), `EventHandler '${eventHandlerType.getTypeName()}' does not have observable applied.`)
                .ensure(t => Reflect.hasOwnMetadata(observed_event_1.observerSymbol, t), `EventHandler '${eventHandlerType.getTypeName()}' does not have observer applied.`);
            this._observableType = Reflect.getOwnMetadata(observed_event_1.observableSymbol, this._eventHandlerType);
            this._observableTypeName = this._observableType.getTypeName();
            this._observerType = Reflect.getOwnMetadata(observed_event_1.observerSymbol, this._eventHandlerType);
            this._observerTypeName = this._observerType.getTypeName();
        }
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
    get eventHandlerType() { return this._eventHandlerType; }
    get eventHandlerTypeName() { return this._eventHandlerTypeName; }
    get eventType() { return this._eventType; }
    get eventTypeName() { return this._eventTypeName; }
    get isObservedEvent() { return this._isObservedEvent; }
    get observableType() {
        (0, n_defensive_1.given)(this, "this").ensure(t => t._isObservedEvent, "not observed event");
        return this._observableType;
    }
    get observableTypeName() {
        (0, n_defensive_1.given)(this, "this").ensure(t => t._isObservedEvent, "not observed event");
        return this._observableTypeName;
    }
    get observerType() {
        (0, n_defensive_1.given)(this, "this").ensure(t => t._isObservedEvent, "not observed event");
        return this._observerType;
    }
    get observerTypeName() {
        (0, n_defensive_1.given)(this, "this").ensure(t => t._isObservedEvent, "not observed event");
        return this._observerTypeName;
    }
    get observationKey() {
        return EventRegistration.generateObservationKey(this.observerTypeName, this.observableTypeName, this.eventTypeName);
    }
    static generateObservationKey(observerTypeName, observableTypeName, observableEventTypeName) {
        (0, n_defensive_1.given)(observerTypeName, "observerTypeName").ensureHasValue().ensureIsString();
        (0, n_defensive_1.given)(observableTypeName, "observableTypeName").ensureHasValue().ensureIsString();
        (0, n_defensive_1.given)(observableEventTypeName, "observableEventTypeName").ensureHasValue().ensureIsString();
        return `.${observerTypeName}.${observableTypeName}.${observableEventTypeName}`;
    }
}
exports.EventRegistration = EventRegistration;
//# sourceMappingURL=event-registration.js.map