import { EdaEvent } from "./eda-event.js";
import { Disposable } from "@nivinjoseph/n-util";
import { EdaManager } from "./eda-manager.js";

// public
export interface EventBus extends Disposable
{
    initialize(manager: EdaManager): void;
    // publish(topic: string, event: EdaEvent): Promise<void>;
    
    publish(topic: string, ...events: ReadonlyArray<EdaEvent>): Promise<void>;
    

    subscribeToObservables(observerType: Function, observerId: string, watches: ReadonlyArray<ObservableWatch>): Promise<void>;
    unsubscribeFromObservables(observerType: Function, observerId: string, watches: ReadonlyArray<ObservableWatch>): Promise<void>;
}

export type ObservableWatch = {
    observableType: Function | string;
    observableId: string;
    observableEventType: Function | string;
    // observerEventHandlerType: Function;
};