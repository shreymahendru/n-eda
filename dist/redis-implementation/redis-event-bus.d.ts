import { EventBus } from "../event-bus";
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
    dispose(): Promise<void>;
    private _generateKey;
}
