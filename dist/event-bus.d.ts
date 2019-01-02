import { EdaEvent } from "./eda-event";
export interface EventBus {
    publish(event: EdaEvent): Promise<void>;
}
