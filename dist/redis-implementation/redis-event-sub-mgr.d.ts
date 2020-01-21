import { EventSubMgr } from "../event-sub-mgr";
import { EdaManager } from "../eda-manager";
import { ServiceLocator } from "@nivinjoseph/n-ject";
import { EdaEvent } from "../eda-event";
export declare class RedisEventSubMgr implements EventSubMgr {
    private readonly _client;
    private readonly _consumers;
    private _isDisposed;
    private _disposePromise;
    private _manager;
    private _isConsuming;
    constructor();
    initialize(manager: EdaManager): void;
    consume(): Promise<void>;
    dispose(): Promise<void>;
    protected onEventReceived(scope: ServiceLocator, topic: string, event: EdaEvent): void;
}
