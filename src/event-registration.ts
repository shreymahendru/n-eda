import { given } from "@nivinjoseph/n-defensive";
import { ClassHierarchy } from "@nivinjoseph/n-util";
import { EdaEventHandler } from "./eda-event-handler.js";
import { eventSymbol } from "./event.js";
import { observableSymbol, observedEventSymbol, observerSymbol } from "./observed-event.js";
import { ObserverEdaEventHandler } from "./observer-eda-event-handler.js";

// public
export class EventRegistration
{
    private readonly _eventHandlerType: ClassHierarchy<EdaEventHandler<any>>;
    private readonly _eventHandlerTypeName: string;
    private readonly _eventType: Function;
    private readonly _eventTypeName: string;
    
    private readonly _isObservedEvent: boolean = false;
    private readonly _observableType: Function | null = null;
    private readonly _observableTypeName: string | null = null;
    private readonly _observerType: Function | null = null;
    private readonly _observerTypeName: string | null = null;
    

    public get eventHandlerType(): ClassHierarchy<EdaEventHandler<any>> { return this._eventHandlerType; }
    public get eventHandlerTypeName(): string { return this._eventHandlerTypeName; }
    public get eventType(): Function { return this._eventType; }
    public get eventTypeName(): string { return this._eventTypeName; }
    
    public get isObservedEvent(): boolean { return this._isObservedEvent; }
    public get observableType(): Function
    {
        given(this, "this").ensure(t => t._isObservedEvent, "not observed event");
        return this._observableType!;
    }
    public get observableTypeName(): string
    {
        given(this, "this").ensure(t => t._isObservedEvent, "not observed event");
        return this._observableTypeName!;
    }
    public get observerType(): Function
    {
        given(this, "this").ensure(t => t._isObservedEvent, "not observed event");
        return this._observerType!;
    }
    public get observerTypeName(): string
    {
        given(this, "this").ensure(t => t._isObservedEvent, "not observed event");
        return this._observerTypeName!;
    }
    public get observationKey(): string
    {
        return EventRegistration.generateObservationKey(this.observerTypeName,
            this.observableTypeName, this.eventTypeName);
    }
    

    public constructor(eventHandlerType: ClassHierarchy<EdaEventHandler<any> | ObserverEdaEventHandler<any>>)
    {
        given(eventHandlerType, "eventHandlerType").ensureHasValue().ensureIsFunction()
            .ensure(t => Reflect.hasOwnMetadata(eventSymbol, t)
                || Reflect.hasOwnMetadata(observedEventSymbol, t),
                `EventHandler '${(<Object>eventHandlerType).getTypeName()}' does not have event or observedEvent applied.`)
            .ensure(t => !(Reflect.hasOwnMetadata(eventSymbol, t)
                && Reflect.hasOwnMetadata(observedEventSymbol, t)),
                `EventHandler '${(<Object>eventHandlerType).getTypeName()}' has both event and observedEvent applied.`)
            ;

        this._eventHandlerType = eventHandlerType;
        this._eventHandlerTypeName = (<Object>eventHandlerType).getTypeName();
        
        if (Reflect.hasOwnMetadata(eventSymbol, eventHandlerType))
        {
            this._eventType = Reflect.getOwnMetadata(eventSymbol, this._eventHandlerType);
        }
        else // observedEvent
        {
            this._eventType = Reflect.getOwnMetadata(observedEventSymbol, this._eventHandlerType);
            this._isObservedEvent = true;
            
            given(eventHandlerType, "eventHandlerType").ensureHasValue().ensureIsFunction()
                .ensure(t => Reflect.hasOwnMetadata(observableSymbol, t),
                    `EventHandler '${(<Object>eventHandlerType).getTypeName()}' does not have observable applied.`)
                .ensure(t => Reflect.hasOwnMetadata(observerSymbol, t),
                    `EventHandler '${(<Object>eventHandlerType).getTypeName()}' does not have observer applied.`)
                ;
            
            this._observableType = Reflect.getOwnMetadata(observableSymbol, this._eventHandlerType);
            this._observableTypeName = (<Object>this._observableType).getTypeName();        
            
            this._observerType = Reflect.getOwnMetadata(observerSymbol, this._eventHandlerType);
            this._observerTypeName = (<Object>this._observerType).getTypeName();        
        }
        
        this._eventTypeName = (<Object>this._eventType).getTypeName();    

        
        
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
    
    public static generateObservationKey(observerTypeName: string, observableTypeName: string, observableEventTypeName: string): string
    {
        given(observerTypeName, "observerTypeName").ensureHasValue().ensureIsString();
        given(observableTypeName, "observableTypeName").ensureHasValue().ensureIsString();
        given(observableEventTypeName, "observableEventTypeName").ensureHasValue().ensureIsString();
        
        return `.${observerTypeName}.${observableTypeName}.${observableEventTypeName}`;
    }
}