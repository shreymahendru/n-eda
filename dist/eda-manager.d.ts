import { EdaConfig } from "./eda-config";
import { Registry } from "@nivinjoseph/n-ject";
import { Disposable } from "@nivinjoseph/n-util";
export declare class EdaManager implements Disposable {
    private readonly _container;
    private readonly _eventMap;
    private _isDisposed;
    private _isBootstrapped;
    static readonly eventBusKey: string;
    static readonly eventSubMgrKey: string;
    readonly containerRegistry: Registry;
    constructor(config: EdaConfig);
    bootstrap(): void;
    dispose(): Promise<void>;
    private createEventMap;
    private registerBusAndMgr;
}
