import { ServiceLocator } from "@nivinjoseph/n-ject";
import { Disposable, Subscription } from "@nivinjoseph/n-util";
import { EdaEvent } from "../eda-event";
import { EdaManager } from "../eda-manager";
import { WorkItem } from "./broker";
export declare class Processor implements Disposable {
    private readonly _manager;
    private readonly _logger;
    private readonly _onEventReceived;
    private _availabilityObserver;
    private _currentWorkItem;
    private _processPromise;
    private _isDisposed;
    private get _isInitialized();
    get isBusy(): boolean;
    constructor(manager: EdaManager, onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void);
    initialize(availabilityCallback: (p: this) => void): Subscription;
    process(workItem: WorkItem): void;
    dispose(): Promise<void>;
    private _process;
    private processEvent;
}
