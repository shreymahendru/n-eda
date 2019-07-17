export declare class EventRegistration {
    private readonly _eventTypeName;
    private readonly _eventHandlerTypeName;
    private readonly _eventHandlerType;
    private readonly _isWild;
    readonly eventTypeName: string;
    readonly eventHandlerTypeName: string;
    readonly eventHandlerType: Function;
    readonly isWild: boolean;
    constructor(eventHandlerType: Function);
}
