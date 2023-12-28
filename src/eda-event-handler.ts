import { EdaEvent } from "./eda-event.js";

// public
export interface EdaEventHandler<TEvent extends EdaEvent>
{
    handle(event: TEvent): Promise<void>;
}