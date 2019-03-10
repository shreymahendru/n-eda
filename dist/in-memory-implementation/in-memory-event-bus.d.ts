import { EventBus } from "../event-bus";
import { EdaEvent } from "../eda-event";
export declare class InMemoryEventBus implements EventBus {
    private _isDisposed;
    private _onPublish;
    publish(event: EdaEvent): Promise<void>;
    onPublish(callback: (e: EdaEvent) => void): void;
    dispose(): Promise<void>;
}
