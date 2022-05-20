import { ClassHierarchy } from "@nivinjoseph/n-util";
import { EdaEventHandler } from "./eda-event-handler";
export declare class EventRegistration {
    private readonly _eventType;
    private readonly _eventTypeName;
    private readonly _eventHandlerTypeName;
    private readonly _eventHandlerType;
    get eventType(): Function;
    get eventTypeName(): string;
    get eventHandlerTypeName(): string;
    get eventHandlerType(): ClassHierarchy<EdaEventHandler<any>>;
    constructor(eventHandlerType: ClassHierarchy<EdaEventHandler<any>>);
}
