import { EventBus, ObservableWatch } from "../event-bus";
import { EdaManager } from "../eda-manager";
import { EdaEvent } from "../eda-event";
import Redis from "ioredis";
export declare class RedisEventBus implements EventBus {
    private readonly _nedaClearTrackedKeysEventName;
    private readonly _client;
    private readonly _producers;
    private _isDisposing;
    private _isDisposed;
    private _disposePromise;
    private _manager;
    private _logger;
    constructor(redisClient: Redis);
    initialize(manager: EdaManager): void;
    publish(topic: string, ...events: ReadonlyArray<EdaEvent>): Promise<void>;
    subscribeToObservables(observerType: Function, observerId: string, watches: ReadonlyArray<ObservableWatch>): Promise<void>;
    unsubscribeFromObservables(observerType: Function, observerId: string, watches: ReadonlyArray<ObservableWatch>): Promise<void>;
    dispose(): Promise<void>;
    private _generateKey;
    private _generateObservableKey;
    private _generateObserverKey;
    private _checkForSubscribers;
    private _fetchSubscribers;
}
