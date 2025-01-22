import { EdaEvent } from "./eda-event";
export interface ObserverEdaEventHandler<TEvent extends EdaEvent> {
    handle(event: TEvent, observerId: string): Promise<void>;
}
