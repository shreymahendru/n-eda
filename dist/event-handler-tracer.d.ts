export declare type EventInfo = {
    readonly topic: string;
    readonly partition: number;
    readonly partitionKey: string;
    readonly eventName: string;
    readonly eventId: string;
};
export declare type EventHandlerTracer = (eventInfo: EventInfo, eventHandlerExec: () => Promise<void>) => Promise<void>;
