import { EdaEvent } from "./eda-event";
export interface EdaEventHandler<TEvent extends EdaEvent> {
    handle(event: TEvent): Promise<void>;
}
