import { EventBus } from "../event-bus";
import { EdaManager } from "../eda-manager";
import { EdaEvent } from "../eda-event";
import * as Redis from "redis";
export declare class RedisEventBus implements EventBus {
    private readonly _edaPrefix;
    private readonly _client;
    private _isDisposed;
    private _disposePromise;
    private _manager;
    private _logger;
    constructor(redisClient: Redis.RedisClient);
    initialize(manager: EdaManager): void;
    publish(topic: string, event: EdaEvent): Promise<void>;
    dispose(): Promise<void>;
    private incrementPartitionWriteIndex;
    private storeEvent;
}
