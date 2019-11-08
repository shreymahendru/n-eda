import { EventBus } from "../event-bus";
import { EdaEvent } from "../eda-event";
import { EdaManager } from "../eda-manager";
export declare class InMemoryEventBus implements EventBus {
    private _isDisposed;
    private _onPublish;
    private _manager;
    initialize(manager: EdaManager): void;
    publish(topic: string, event: EdaEvent): Promise<void>;
    onPublish(callback: (topic: string, partition: number, event: EdaEvent) => void): void;
    dispose(): Promise<void>;
}
