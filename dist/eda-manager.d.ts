import { EdaConfig } from "./eda-config";
import { EventBus } from "./event-bus";
import { EventSubMgr } from "./event-sub-mgr";
import { Disposable } from "@nivinjoseph/n-util";
export declare class EdaManager implements Disposable {
    private readonly _eventBusKey;
    private readonly _eventSubMgrKey;
    private readonly _container;
    private readonly _eventMap;
    private readonly _eventBus;
    private readonly _eventSubMgr;
    readonly eventBusKey: string;
    readonly eventBus: EventBus;
    readonly eventSubMgrKey: string;
    readonly eventSubMgr: EventSubMgr;
    constructor(config: EdaConfig);
    dispose(): Promise<void>;
    private initialize;
}
