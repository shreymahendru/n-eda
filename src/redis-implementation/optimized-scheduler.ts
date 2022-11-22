import { given } from "@nivinjoseph/n-defensive";
import { Deferred, Duration } from "@nivinjoseph/n-util";
import { RoutedEvent } from "./broker";
import { Processor } from "./processor";
import { Queue } from "./queue";
import { WorkItem } from "./scheduler";


export class OptimizedScheduler
{
    private readonly _queues = new Map<string, Queue<WorkItem>>();
    private readonly _processing = new Set<string>();
    private readonly _processors = new Queue<Processor>();
    private readonly _partitionQueue = new Queue<string>();
    
    private readonly _cleanupDuration = Duration.fromHours(1).toMilliSeconds();
    private _cleanupTime = Date.now() + this._cleanupDuration;


    public constructor(processors: ReadonlyArray<Processor>)
    {
        given(processors, "processors").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty);

        processors.forEach(t =>
        {
            this._processors.enqueue(t);

            t.availability.subscribe((proc) =>
            {
                this._processors.enqueue(proc);
                this._executeAvailableWork();
            });
            t.doneProcessing.subscribe((workItem) => this._processing.delete(workItem.partitionKey));
        });
    }


    public scheduleWork(routedEvent: RoutedEvent): Promise<void>
    {
        const deferred = new Deferred<void>();

        const workItem: WorkItem = {
            ...routedEvent,
            deferred
        };

        const queue = this._queues.get(workItem.partitionKey);
        if(queue)
            queue.enqueue(workItem);
        else
            this._queues.set(workItem.partitionKey, new Queue<WorkItem>([workItem]));

        this._partitionQueue.enqueue(workItem.partitionKey);

        this._executeAvailableWork();

        return workItem.deferred.promise;
    }

    private _executeAvailableWork(): void
    {
        if (this._processors.isEmpty)
            return;

        const workItem = this._findWork();
        if (workItem === null)
            return;

        const availableProcessor = this._processors.dequeue()!;

        availableProcessor.process(workItem);

        this._processing.add(workItem.partitionKey);
    }

    private _findWork(): WorkItem | null
    {
        if (this._cleanupTime < Date.now())
        {
            for (const entry of this._queues.entries())
            {
                if (entry[1].isEmpty)
                    this._queues.delete(entry[0]);
            }
            
            this._cleanupTime = Date.now() + this._cleanupDuration;
        }
        
        if (this._partitionQueue.isEmpty)
            return null;
        
        let cycle = 0;
        while (cycle < this._partitionQueue.length)
        {
            const partitionKey = this._partitionQueue.dequeue()!;            
            
            if (this._processing.has(partitionKey))
            {
                this._partitionQueue.enqueue(partitionKey);
                cycle++;
                continue;
            }
            
            const queue = this._queues.get(partitionKey)!;
            
            if (queue.isEmpty)
                continue;
            
            return queue.dequeue();
        }
        
        return null;
    }
}