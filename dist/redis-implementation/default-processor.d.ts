import { ServiceLocator } from "@nivinjoseph/n-ject";
import { EdaEvent } from "../eda-event";
import { EdaManager } from "../eda-manager";
import { Processor } from "./processor";
import { WorkItem } from "./scheduler";
export declare class DefaultProcessor extends Processor {
    private readonly _onEventReceived;
    constructor(manager: EdaManager, onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void);
    protected processEvent(workItem: WorkItem, numAttempt: number): Promise<void>;
}
