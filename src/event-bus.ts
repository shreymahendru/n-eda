import { EdaEvent } from "./eda-event";

// public
export interface EventBus
{
    publish(event: EdaEvent): Promise<void>;
}