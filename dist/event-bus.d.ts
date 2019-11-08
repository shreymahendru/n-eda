import { EdaEvent } from "./eda-event";
import { Disposable } from "@nivinjoseph/n-util";
import { EdaManager } from "./eda-manager";
export interface EventBus extends Disposable {
    initialize(manager: EdaManager): void;
    publish(topic: string, event: EdaEvent): Promise<void>;
}
