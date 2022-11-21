import { RoutedEvent } from "./broker";
import { Processor } from "./processor";
export declare class DefaultScheduler {
    private readonly _queues;
    private readonly _processing;
    private readonly _processors;
    constructor(processors: ReadonlyArray<Processor>);
    scheduleWork(routedEvent: RoutedEvent): Promise<void>;
    private _executeAvailableWork;
    private _findWork;
}
