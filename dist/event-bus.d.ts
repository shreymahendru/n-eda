import { EdaEvent } from "./eda-event";
import { Disposable } from "@nivinjoseph/n-util";
import { EdaManager } from "./eda-manager";
export interface EventBus extends Disposable {
    initialize(manager: EdaManager): void;
    publish(topic: string, ...events: ReadonlyArray<EdaEvent>): Promise<void>;
    subscribeToObservables(observerType: Function, observerId: string, watches: ReadonlyArray<ObservableWatch>): Promise<void>;
    unsubscribeFromObservables(observerType: Function, observerId: string, watches: ReadonlyArray<ObservableWatch>): Promise<void>;
}
export declare type ObservableWatch = {
    observableType: Function | string;
    observableId: string;
    observableEventType: Function | string;
};
