import { RoutedEvent } from "./broker";
import { Processor } from "./processor";
import { Scheduler } from "./scheduler";
export declare class OptimizedScheduler implements Scheduler {
    private readonly _queues;
    private readonly _processing;
    private readonly _processors;
    private readonly _partitionQueue;
    private readonly _cleanupDuration;
    private _cleanupTime;
    private _isDisposed;
    constructor(processors: ReadonlyArray<Processor>);
    scheduleWork(routedEvent: RoutedEvent): Promise<void>;
    dispose(): Promise<void>;
    private _executeAvailableWork;
    private _findWork;
}
