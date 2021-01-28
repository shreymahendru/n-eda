import * as Redis from "redis";
import { EdaEvent } from "../eda-event";
import { Logger } from "@nivinjoseph/n-log";
export declare class Producer {
    private readonly _edaPrefix;
    private readonly _client;
    private readonly _logger;
    private readonly _topic;
    private readonly _ttlMinutes;
    private readonly _partition;
    private readonly _mutex;
    constructor(client: Redis.RedisClient, logger: Logger, topic: string, ttlMinutes: number, partition: number);
    produce(...events: ReadonlyArray<EdaEvent>): Promise<void>;
    private compressEvent;
    private acquireWriteIndex;
    private incrementPartitionWriteIndex;
    private storeEvent;
}
