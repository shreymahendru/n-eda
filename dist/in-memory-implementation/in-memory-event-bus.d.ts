import { EventBus } from "../event-bus";
import { EdaEvent } from "../eda-event";
export declare class InMemoryEventBus implements EventBus {
    private _isDisposed;
    private _onPublish;
    publish(...events: EdaEvent[]): Promise<void>;
    onPublish(callback: (events: ReadonlyArray<EdaEvent>) => void): void;
    dispose(): Promise<void>;
}
