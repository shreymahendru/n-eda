import { ServiceLocator } from "@nivinjoseph/n-ject";
import { EdaEvent } from "../eda-event";
import { EdaManager } from "../eda-manager";
import { RpcModel } from "../rpc-details";
export declare class RpcEventHandler {
    private _manager;
    private _logger;
    initialize(manager: EdaManager): void;
    process(model: RpcModel): Promise<{
        eventName: string;
        eventId: string;
    } | {
        statusCode: number;
        error: string;
    }>;
    private _process;
    protected onEventReceived(scope: ServiceLocator, topic: string, event: EdaEvent): void;
    private _getErrorMessage;
}
