import { EventSubMgr } from "../event-sub-mgr";
import { ServiceLocator } from "@nivinjoseph/n-ject";
import { EdaEvent } from "../eda-event";
import { EdaManager } from "../eda-manager";
export declare class InMemoryEventSubMgr implements EventSubMgr {
    private readonly _consumers;
    private _isDisposed;
    private _manager;
    private _logger;
    private _isInitialized;
    initialize(manager: EdaManager): void;
    wait(): Promise<void>;
    dispose(): Promise<void>;
    protected onEventReceived(scope: ServiceLocator, topic: string, event: EdaEvent): void;
}
