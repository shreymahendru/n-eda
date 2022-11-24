import { Logger } from "@nivinjoseph/n-log";
import { Disposable, Observable } from "@nivinjoseph/n-util";
import { EdaManager } from "../eda-manager";
import { WorkItem } from "./scheduler";
export declare abstract class Processor implements Disposable {
    private readonly _manager;
    private readonly _eventHandlerTracer;
    private readonly _hasEventHandlerTracer;
    private readonly _logger;
    private readonly _availabilityObserver;
    private readonly _doneProcessingObserver;
    private _currentWorkItem;
    private _processPromise;
    private _isDisposed;
    private get _isInitialized();
    protected get manager(): EdaManager;
    protected get logger(): Logger;
    get availability(): Observable<this>;
    get doneProcessing(): Observable<WorkItem>;
    get isBusy(): boolean;
    constructor(manager: EdaManager);
    process(workItem: WorkItem): void;
    dispose(): Promise<void>;
    protected abstract processEvent(workItem: WorkItem, numAttempt: number): Promise<void>;
    private _process;
    private _executeProcessing;
}
