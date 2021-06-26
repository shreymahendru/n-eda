import { ServiceLocator } from "@nivinjoseph/n-ject";
import { Disposable } from "@nivinjoseph/n-util";
import { EdaEvent } from "../eda-event";
import { EdaManager } from "../eda-manager";
import { Scheduler } from "./broker";
export declare class Processor implements Disposable {
    private readonly _defaultDelayMS;
    private readonly _manager;
    private readonly _logger;
    private readonly _onEventReceived;
    private _scheduler;
    private _processPromise;
    private _isDisposed;
    constructor(manager: EdaManager, onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void);
    registerScheduler(scheduler: Scheduler): void;
    process(): void;
    dispose(): Promise<void>;
    private beginProcessing;
    private processEvent;
}
