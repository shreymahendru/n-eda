import { EdaEvent } from "./eda-event";
import { Disposable } from "@nivinjoseph/n-util";

// public
export interface EventBus extends Disposable
{
    publish(event: EdaEvent): Promise<void>;
}