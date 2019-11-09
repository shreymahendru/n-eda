export declare class EventRegistration {
    private readonly _eventType;
    private readonly _eventTypeName;
    private readonly _eventHandlerTypeName;
    private readonly _eventHandlerType;
    readonly eventType: Function;
    readonly eventTypeName: string;
    readonly eventHandlerTypeName: string;
    readonly eventHandlerType: Function;
    constructor(eventHandlerType: Function);
}
