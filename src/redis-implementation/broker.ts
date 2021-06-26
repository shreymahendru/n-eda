import { given } from "@nivinjoseph/n-defensive";
import { ObjectDisposedException } from "@nivinjoseph/n-exception";
import { Deferred, Disposable } from "@nivinjoseph/n-util";
import { EdaEvent } from "../eda-event";
import { EventRegistration } from "../event-registration";
import { Consumer } from "./consumer";
import { Processor } from "./processor";


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

class Scheduler
{
    private readonly _queues = new Map<string, SchedulerQueue>();
    private readonly _processors: ReadonlyArray<Processor>;
    
    
    public constructor(processors: ReadonlyArray<Processor>)
    {
        given(processors, "processors").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty);
        this._processors = processors;
        
        this._processors.forEach(t => t.initialize(this._onAvailable.bind(this)));
    }
    
    
    public scheduleWork(routedEvent: RoutedEvent): Promise<void>
    {
        const deferred = new Deferred<void>();
        
        const workItem: WorkItem = {
            ...routedEvent,
            deferred
        };
        
        if (this._queues.has(workItem.partitionKey))
            this._queues.get(workItem.partitionKey)!.queue.unshift(workItem);
        else
            this._queues.set(workItem.partitionKey, {
                partitionKey: workItem.partitionKey,
                lastAccessed: Date.now(),
                queue: [workItem]
            });
        
        this._executeAvailableWork();
        
        return workItem.deferred.promise;
    }
    
    private _onAvailable(processor: Processor): void
    {
        given(processor, "processor").ensureHasValue().ensureIsObject().ensureIsType(Processor);
        
        this._executeAvailableWork(processor);
    }
    
    private _executeAvailableWork(processor?: Processor): void
    {
        const availableProcessor = processor ?? this._processors.find(t => !t.isBusy);
        if (availableProcessor == null)
            return;
        
        let workItem: WorkItem | null = null;
        
        // FIXME: this is a shitty priority queue
        const entries = [...this._queues.values()].orderBy(t => t.lastAccessed);
        
        for (const entry of entries)
        {
            if (entry.queue.isEmpty)
            {
                this._queues.delete(entry.partitionKey);
                continue;
            }

            workItem = entry.queue.pop()!;
            if (entry.queue.isEmpty)
                this._queues.delete(entry.partitionKey);
            else
                entry.lastAccessed = Date.now();
            
            break;
        }
        
        if (workItem == null)
            return;
        
        availableProcessor.process(workItem);
    }
}

interface SchedulerQueue
{
    partitionKey: string;
    lastAccessed: number;
    queue: Array<WorkItem>;
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

export interface WorkItem extends RoutedEvent
{
    deferred: Deferred<void>;
}