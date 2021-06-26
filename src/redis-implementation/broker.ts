import { given } from "@nivinjoseph/n-defensive";
import { ObjectDisposedException } from "@nivinjoseph/n-exception";
import { Deferred, Disposable } from "@nivinjoseph/n-util";
import { EdaEvent } from "../eda-event";
import { EdaManager } from "../eda-manager";
import { EventRegistration } from "../event-registration";
import { Consumer } from "./consumer";
import { Processor } from "./processor";


export class Broker implements Disposable
{
    private readonly _manager: EdaManager;
    private readonly _consumers: ReadonlyArray<Consumer>;
    private readonly _processors: ReadonlyArray<Processor>;
    private readonly _scheduler = new Scheduler();
    
    private _isDisposed = false;
    
    
    public constructor(manager: EdaManager, consumers: ReadonlyArray<Consumer>, processors: ReadonlyArray<Processor>)
    {
        given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(EdaManager);
        this._manager = manager;
        
        given(consumers, "consumers").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty);
        this._consumers = consumers;
        
        given(processors, "processors").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty)
            .ensure(t => t.length === consumers.length, "length has to match consumers length");
        this._processors = processors;
    }
    
    
    public initialize(): void
    {
        this._consumers.forEach(t => t.registerBroker(this));
        this._consumers.forEach(t => t.consume());
        
        this._processors.forEach(t => t.registerScheduler(this._scheduler));
        this._processors.forEach(t => t.process());
    }
    
    public route(consumerId: string, topic: string, partition: number, eventName: string, eventRegistration: EventRegistration,
        eventIndex: number, eventKey: string, eventId: string, event: EdaEvent): Promise<void>
    {
        if (this._isDisposed)
            throw new ObjectDisposedException("Broker");
        
        const partitionKey = this._manager.partitionKeyMapper(event);
        const deferred = new Deferred<void>();
        
        this._scheduler.scheduleWork({
            consumerId,
            topic,
            partition,
            eventName,
            eventRegistration,
            eventIndex,
            eventKey,
            eventId,
            event,
            partitionKey,
            deferred
        });
        
        return deferred.promise;        
    }
    
    public async dispose(): Promise<void>
    {
        this._isDisposed = true;
        await Promise.all(this._consumers.map(t => t.dispose()));
    }
}

export class Scheduler
{
    private readonly _queues = new Map<string, Array<WorkItem>>();
    
    
    public scheduleWork(workItem: WorkItem): void
    {
        if (this._queues.has(workItem.partitionKey))
        {
            this._queues.get(workItem.partitionKey)!.unshift(workItem);
        }
        else
        {
            this._queues.set(workItem.partitionKey, [workItem]);
        }
    }
    
    public next(): WorkItem | null
    {
        // TODO: make this round robin
        for (const entry of this._queues.entries())
        {
            if (entry[1].isEmpty)
            {
                this._queues.delete(entry[0]);
                continue;
            }
            
            return entry[1].pop()!;
        }
        
        return null;
    }
}

export interface WorkItem
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
    deferred: Deferred<void>;
}