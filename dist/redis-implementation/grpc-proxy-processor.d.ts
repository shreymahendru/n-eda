import { EdaManager } from "../eda-manager";
import { Processor } from "./processor";
import { WorkItem } from "./scheduler";
export declare class GrpcProxyProcessor extends Processor {
    private readonly _grpcClient;
    constructor(manager: EdaManager);
    protected processEvent(workItem: WorkItem, numAttempt: number): Promise<void>;
    private _invokeGRPC;
}
