import { ServiceLocator } from "@nivinjoseph/n-ject";
import { Disposable, Observable } from "@nivinjoseph/n-util";
import { EdaEvent } from "../eda-event";
import { EdaManager } from "../eda-manager";
import { WorkItem } from "./scheduler";
export declare class Processor implements Disposable {
    private readonly _manager;
    private readonly _logger;
    private readonly _onEventReceived;
    private readonly _availabilityObserver;
    private readonly _doneProcessingObserver;
    private _currentWorkItem;
    private _processPromise;
    private _isDisposed;
    private get _isInitialized();
    get availability(): Observable<this>;
    get doneProcessing(): Observable<WorkItem>;
    get isBusy(): boolean;
    constructor(manager: EdaManager, onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void);
    process(workItem: WorkItem): void;
    dispose(): Promise<void>;
    private _process;
    private processEvent;
}
