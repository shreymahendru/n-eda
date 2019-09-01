import { EdaEvent } from "./eda-event";
import { Disposable } from "@nivinjoseph/n-util";
export interface EventBus extends Disposable {
    publish(...events: EdaEvent[]): Promise<void>;
}
