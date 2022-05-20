import { EventBus } from "../event-bus";
import { EdaManager } from "../eda-manager";
import { EdaEvent } from "../eda-event";
import * as Redis from "redis";
export declare class RedisEventBus implements EventBus {
    private readonly _client;
    private readonly _producers;
    private _isDisposed;
    private _disposePromise;
    private _manager;
    private _logger;
    constructor(redisClient: Redis.RedisClient);
    initialize(manager: EdaManager): void;
    publish(topic: string, ...events: ReadonlyArray<EdaEvent>): Promise<void>;
    dispose(): Promise<void>;
    private _generateKey;
}
