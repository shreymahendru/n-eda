import { EdaEvent } from "./eda-event.js";

// public
export interface ObserverEdaEventHandler<TEvent extends EdaEvent>
{
    handle(event: TEvent, observerId: string): Promise<void>;
}