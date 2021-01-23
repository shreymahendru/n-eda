import { EdaEvent } from "./eda-event";
import { Disposable } from "@nivinjoseph/n-util";
import { EdaManager } from "./eda-manager";

// public
export interface EventBus extends Disposable
{
    initialize(manager: EdaManager): void;
    // publish(topic: string, event: EdaEvent): Promise<void>;
    
    publish(topic: string, ...events: ReadonlyArray<EdaEvent>): Promise<void>;
}