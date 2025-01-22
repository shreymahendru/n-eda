import { EdaManager } from "../eda-manager";
import { WorkItem } from "./scheduler";
export declare class GrpcClientFactory {
    private readonly _manager;
    private readonly _logger;
    private readonly _endpoint;
    private readonly _serviceDef;
    private readonly _creds;
    private readonly _clients;
    private _roundRobin;
    constructor(manager: EdaManager);
    create(): GrpcClient;
}
export interface GrpcClient {
    process(workItem: WorkItem): Promise<{
        eventName: string;
        eventId: string;
    }>;
}
