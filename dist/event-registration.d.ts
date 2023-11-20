import { ClassHierarchy } from "@nivinjoseph/n-util";
import { EdaEventHandler } from "./eda-event-handler";
import { ObserverEdaEventHandler } from "./observer-eda-event-handler";
export declare class EventRegistration {
    private readonly _eventHandlerType;
    private readonly _eventHandlerTypeName;
    private readonly _eventType;
    private readonly _eventTypeName;
    private readonly _isObservedEvent;
    private readonly _observableType;
    private readonly _observableTypeName;
    private readonly _observerType;
    private readonly _observerTypeName;
    get eventHandlerType(): ClassHierarchy<EdaEventHandler<any>>;
    get eventHandlerTypeName(): string;
    get eventType(): Function;
    get eventTypeName(): string;
    get isObservedEvent(): boolean;
    get observableType(): Function;
    get observableTypeName(): string;
    get observerType(): Function;
    get observerTypeName(): string;
    get observationKey(): string;
    constructor(eventHandlerType: ClassHierarchy<EdaEventHandler<any> | ObserverEdaEventHandler<any>>);
    static generateObservationKey(observerTypeName: string, observableTypeName: string, observableEventTypeName: string): string;
}
