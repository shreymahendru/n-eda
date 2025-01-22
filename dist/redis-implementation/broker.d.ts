import { Disposable } from "@nivinjoseph/n-util";
import { EdaEvent } from "../eda-event";
import { EventRegistration } from "../event-registration";
import { Consumer } from "./consumer";
import { Processor } from "./processor";
import * as otelApi from "@opentelemetry/api";
export declare class Broker implements Disposable {
    private readonly _consumers;
    private readonly _processors;
    private readonly _scheduler;
    private _isDisposed;
    constructor(consumers: ReadonlyArray<Consumer>, processors: ReadonlyArray<Processor>);
    initialize(): void;
    route(routedEvent: RoutedEvent): Promise<void>;
    dispose(): Promise<void>;
}
export interface RoutedEvent {
    consumerId: string;
    topic: string;
    partition: number;
    eventName: string;
    eventRegistration: EventRegistration;
    eventIndex: number;
    eventKey: string;
    eventId: string;
    rawEvent: object;
    event: EdaEvent;
    partitionKey: string;
    span: otelApi.Span;
}
