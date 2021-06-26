import { Deferred, Disposable } from "@nivinjoseph/n-util";
import { EdaEvent } from "../eda-event";
import { EdaManager } from "../eda-manager";
import { EventRegistration } from "../event-registration";
import { Consumer } from "./consumer";
import { Processor } from "./processor";
export declare class Broker implements Disposable {
    private readonly _manager;
    private readonly _consumers;
    private readonly _processors;
    private readonly _scheduler;
    private _isDisposed;
    constructor(manager: EdaManager, consumers: ReadonlyArray<Consumer>, processors: ReadonlyArray<Processor>);
    initialize(): void;
    route(consumerId: string, topic: string, partition: number, eventName: string, eventRegistration: EventRegistration, eventIndex: number, eventKey: string, eventId: string, event: EdaEvent): Promise<void>;
    dispose(): Promise<void>;
}
export declare class Scheduler {
    private readonly _queues;
    scheduleWork(workItem: WorkItem): void;
    next(): WorkItem | null;
}
export interface WorkItem {
    consumerId: string;
    topic: string;
    partition: number;
    eventName: string;
    eventRegistration: EventRegistration;
    eventIndex: number;
    eventKey: string;
    eventId: string;
    event: EdaEvent;
    partitionKey: string;
    deferred: Deferred<void>;
}
