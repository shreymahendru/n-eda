import { EdaManager } from "../eda-manager";
import { Processor } from "./processor";
import { WorkItem } from "./scheduler";
import { GrpcClientFactory } from "./grpc-client-factory";
export declare class GrpcProxyProcessor extends Processor {
    private readonly _grpcClient;
    constructor(manager: EdaManager, grpcClientFactory: GrpcClientFactory);
    protected processEvent(workItem: WorkItem): Promise<void>;
}
