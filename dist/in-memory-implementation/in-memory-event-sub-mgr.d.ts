import { EventSubMgr } from "../event-sub-mgr";
import { ServiceLocator } from "@nivinjoseph/n-ject";
import { EdaEvent } from "../eda-event";
import { Logger } from "@nivinjoseph/n-log";
import { EdaManager } from "../eda-manager";
export declare class InMemoryEventSubMgr implements EventSubMgr {
    private readonly _logger;
    private readonly _consumers;
    private _isDisposed;
    private _edaManager;
    private _isInitialized;
    constructor(logger: Logger);
    initialize(manager: EdaManager): void;
    dispose(): Promise<void>;
    protected onEventReceived(scope: ServiceLocator, topic: string, event: EdaEvent): void;
}
