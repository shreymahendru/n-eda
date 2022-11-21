import { given } from "@nivinjoseph/n-defensive";
import { Deferred } from "@nivinjoseph/n-util";
import { RoutedEvent } from "./broker";
import { Processor } from "./processor";
import { Queue } from "./queue";
import { WorkItem } from "./scheduler";


export class OptimizedScheduler
{
    private readonly _queues = new Map<string, SchedulerQueue>();
    private readonly _processing = new Set<string>();
    private readonly _processors = new Queue<Processor>();
    private readonly _partitionQueue = new Queue<string>();


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

        if (this._queues.has(workItem.partitionKey))
            this._queues.get(workItem.partitionKey)!.queue.enqueue(workItem);
        else
            this._queues.set(workItem.partitionKey, {
                partitionKey: workItem.partitionKey,
                // lastAccessed: Date.now(),
                queue: new Queue<WorkItem>([workItem])
            });

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

    // private _findWork(): WorkItem | null
    // {
    //     // FIXME: this is a shitty priority queue
    //     const entries = [...this._queues.values()].orderBy(t => t.lastAccessed);

    //     for (const entry of entries)
    //     {
    //         if (entry.queue.isEmpty)
    //         {
    //             this._queues.delete(entry.partitionKey);
    //             continue;
    //         }

    //         if (this._processing.has(entry.partitionKey))
    //             continue;

    //         const workItem = entry.queue.pop()!;
    //         if (entry.queue.isEmpty)
    //             this._queues.delete(entry.partitionKey);
    //         else
    //             entry.lastAccessed = Date.now();

    //         return workItem;
    //     }

    //     return null;
    // }

    // private _findWork(): WorkItem | null
    // {
    //     // Because we know that Map.Values() returns entries in insertion order
    //     for (const entry of this._queues.values())
    //     {
    //         if (entry.queue.isEmpty)
    //         {
    //             this._queues.delete(entry.partitionKey);
    //             continue;
    //         }

    //         if (this._processing.has(entry.partitionKey))
    //             continue;

    //         const workItem = entry.queue.dequeue();
    //         this._queues.delete(entry.partitionKey);
    //         // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    //         if (!entry.queue.isEmpty)
    //         {
    //             // entry.lastAccessed = Date.now();
    //             this._queues.set(entry.partitionKey, entry);
    //         }

    //         return workItem;
    //     }

    //     return null;
    // }

    private _findWork(): WorkItem | null
    {
        if (this._partitionQueue.isEmpty)
            return null;

        let cycle = 0;
        while (cycle < this._partitionQueue.length)
        {
            const partitionKey = this._partitionQueue.dequeue();
            if (partitionKey === null)
                return null;

            const queue = this._queues.get(partitionKey)!.queue;
            if (queue.isEmpty)
            {
                this._queues.delete(partitionKey);
                continue;
            }

            if (this._processing.has(partitionKey))
            {
                this._partitionQueue.enqueue(partitionKey);
                cycle++;
                continue;
            }

            return queue.dequeue();
        }

        return null;
    }
}


interface SchedulerQueue
{
    partitionKey: string;
    // lastAccessed: number;
    queue: Queue<WorkItem>;
}


