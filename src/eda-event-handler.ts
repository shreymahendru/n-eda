import { EdaEvent } from "./eda-event";

// public
export interface EdaEventHandler<TEvent extends EdaEvent>
{
    handle(event: TEvent): Promise<void>;
}