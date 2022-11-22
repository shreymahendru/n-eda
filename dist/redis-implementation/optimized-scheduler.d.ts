import { RoutedEvent } from "./broker";
import { Processor } from "./processor";
export declare class OptimizedScheduler {
    private readonly _queues;
    private readonly _processing;
    private readonly _processors;
    private readonly _partitionQueue;
    private readonly _cleanupDuration;
    private _cleanupTime;
    constructor(processors: ReadonlyArray<Processor>);
    scheduleWork(routedEvent: RoutedEvent): Promise<void>;
    private _executeAvailableWork;
    private _findWork;
}
