"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizedScheduler = void 0;
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_util_1 = require("@nivinjoseph/n-util");
const queue_1 = require("./queue");
class OptimizedScheduler {
    constructor(processors) {
        this._queues = new Map();
        this._processing = new Set();
        this._processors = new queue_1.Queue();
        this._partitionQueue = new queue_1.Queue();
        (0, n_defensive_1.given)(processors, "processors").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty);
        processors.forEach(t => {
            this._processors.enqueue(t);
            t.availability.subscribe((proc) => {
                this._processors.enqueue(proc);
                this._executeAvailableWork();
            });
            t.doneProcessing.subscribe((workItem) => this._processing.delete(workItem.partitionKey));
        });
    }
    scheduleWork(routedEvent) {
        const deferred = new n_util_1.Deferred();
        const workItem = Object.assign(Object.assign({}, routedEvent), { deferred });
        if (this._queues.has(workItem.partitionKey))
            this._queues.get(workItem.partitionKey).queue.enqueue(workItem);
        else
            this._queues.set(workItem.partitionKey, {
                partitionKey: workItem.partitionKey,
                // lastAccessed: Date.now(),
                queue: new queue_1.Queue([workItem])
            });
        this._partitionQueue.enqueue(workItem.partitionKey);
        this._executeAvailableWork();
        return workItem.deferred.promise;
    }
    _executeAvailableWork() {
        if (this._processors.isEmpty)
            return;
        const workItem = this._findWork();
        if (workItem === null)
            return;
        const availableProcessor = this._processors.dequeue();
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
    _findWork() {
        if (this._partitionQueue.isEmpty)
            return null;
        let cycle = 0;
        while (cycle < this._partitionQueue.length) {
            const partitionKey = this._partitionQueue.dequeue();
            if (partitionKey === null)
                return null;
            const queue = this._queues.get(partitionKey).queue;
            if (queue.isEmpty) {
                this._queues.delete(partitionKey);
                continue;
            }
            if (this._processing.has(partitionKey)) {
                this._partitionQueue.enqueue(partitionKey);
                cycle++;
                continue;
            }
            return queue.dequeue();
        }
        return null;
    }
}
exports.OptimizedScheduler = OptimizedScheduler;
//# sourceMappingURL=optimized-scheduler.js.map