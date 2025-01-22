import { ServiceLocator } from "@nivinjoseph/n-ject";
import { EdaEvent } from "../eda-event";
import { EdaManager } from "../eda-manager";
import { GrpcModel } from "../grpc-details";
export declare class GrpcEventHandler {
    private readonly _nedaDistributedObserverNotifyEventName;
    private _manager;
    private _logger;
    initialize(manager: EdaManager): void;
    process(model: GrpcModel): Promise<{
        eventName: string;
        eventId: string;
    }>;
    protected onEventReceived(scope: ServiceLocator, topic: string, event: EdaEvent): void;
    private _process;
    private _getErrorMessage;
}
