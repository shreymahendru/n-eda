import { ServiceLocator } from "@nivinjoseph/n-ject";
import { EdaEvent } from "../eda-event";
import { EdaManager } from "../eda-manager";
export declare class AwsLambdaEventHandler {
    private readonly _manager;
    private readonly _logger;
    constructor(manager: EdaManager);
    process(event: any, context: any): Promise<{
        eventName: string;
        eventId: string;
    }>;
    private _process;
    protected onEventReceived(scope: ServiceLocator, topic: string, event: EdaEvent): void;
}
