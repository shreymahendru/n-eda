import { EdaManager } from "../eda-manager";
import { Processor } from "./processor";
import { WorkItem } from "./scheduler";
export declare class RpcProxyProcessor extends Processor {
    private readonly _rpcClient;
    constructor(manager: EdaManager);
    protected processEvent(workItem: WorkItem, numAttempt: number): Promise<void>;
    private _invokeRPC;
}
