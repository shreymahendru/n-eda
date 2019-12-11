export declare class EventRegistration {
    private readonly _eventType;
    private readonly _eventTypeName;
    private readonly _eventHandlerTypeName;
    private readonly _eventHandlerType;
    get eventType(): Function;
    get eventTypeName(): string;
    get eventHandlerTypeName(): string;
    get eventHandlerType(): Function;
    constructor(eventHandlerType: Function);
}
