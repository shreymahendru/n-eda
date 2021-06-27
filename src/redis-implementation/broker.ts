import { given } from "@nivinjoseph/n-defensive";
import { ObjectDisposedException } from "@nivinjoseph/n-exception";
import { Disposable } from "@nivinjoseph/n-util";
import { EdaEvent } from "../eda-event";
import { EventRegistration } from "../event-registration";
import { Consumer } from "./consumer";
import { Processor } from "./processor";
import { Scheduler } from "./scheduler";


export class Broker implements Disposable
{
    private readonly _consumers: ReadonlyArray<Consumer>;
    private readonly _scheduler: Scheduler;
    
    private _isDisposed = false;
    
    
    public constructor(consumers: ReadonlyArray<Consumer>, processors: ReadonlyArray<Processor>)
    {
        given(consumers, "consumers").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty);
        this._consumers = consumers;
        
        given(processors, "processors").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty)
            .ensure(t => t.length === consumers.length, "length has to match consumers length");
        this._scheduler = new Scheduler(processors);
    }
    
    
    public initialize(): void
    {
        this._consumers.forEach(t => t.registerBroker(this));
        this._consumers.forEach(t => t.consume());
    }
    
    public route(routedEvent: RoutedEvent): Promise<void>
    {
        if (this._isDisposed)
            throw new ObjectDisposedException("Broker");
        
        return this._scheduler.scheduleWork(routedEvent);
    }
    
    public async dispose(): Promise<void>
    {
        this._isDisposed = true;
        await Promise.all(this._consumers.map(t => t.dispose()));
    }
}


export interface RoutedEvent
{
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
}