import { EventSubMgr } from "../event-sub-mgr";
import { EdaManager } from "../eda-manager";
export declare class RedisEventSubMgr implements EventSubMgr {
    private readonly _client;
    private readonly _consumers;
    private _isDisposed;
    private _disposePromise;
    private _manager;
    constructor();
    initialize(manager: EdaManager): void;
    wait(): Promise<void>;
    dispose(): Promise<void>;
}
