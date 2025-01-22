import { RoutedEvent } from "./broker";
import { Processor } from "./processor";
import { Scheduler } from "./scheduler";
/**
 * @deprecated Only used for baselining
 */
export declare class DefaultScheduler implements Scheduler {
    private readonly _queues;
    private readonly _processing;
    private readonly _processors;
    constructor(processors: ReadonlyArray<Processor>);
    scheduleWork(routedEvent: RoutedEvent): Promise<void>;
    dispose(): Promise<void>;
    private _executeAvailableWork;
    private _findWork;
}
