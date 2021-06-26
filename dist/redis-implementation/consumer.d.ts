/// <reference types="node" />
import { Disposable } from "@nivinjoseph/n-util";
import * as Redis from "redis";
import { EdaManager } from "../eda-manager";
import { Logger } from "@nivinjoseph/n-log";
import { Broker } from "./broker";
export declare class Consumer implements Disposable {
    private readonly _edaPrefix;
    private readonly _defaultDelayMS;
    private readonly _client;
    private readonly _manager;
    private readonly _logger;
    private readonly _topic;
    private readonly _partition;
    private readonly _id;
    private readonly _cleanKeys;
    private _isDisposed;
    private _trackedIdsSet;
    private _trackedIdsArray;
    private _trackedKeysArray;
    private _consumePromise;
    private _broker;
    protected get manager(): EdaManager;
    protected get topic(): string;
    protected get partition(): number;
    protected get logger(): Logger;
    protected get trackedIdsSet(): ReadonlySet<string>;
    protected get isDisposed(): boolean;
    get id(): string;
    constructor(client: Redis.RedisClient, manager: EdaManager, topic: string, partition: number);
    registerBroker(broker: Broker): void;
    consume(): void;
    dispose(): Promise<void>;
    protected beginConsume(): Promise<void>;
    private attemptRoute;
    protected fetchPartitionWriteIndex(): Promise<number>;
    protected fetchConsumerPartitionReadIndex(): Promise<number>;
    protected incrementConsumerPartitionReadIndex(index?: number): Promise<void>;
    protected retrieveEvent(key: string): Promise<Buffer>;
    protected batchRetrieveEvents(lowerBoundIndex: number, upperBoundIndex: number): Promise<Array<{
        index: number;
        key: string;
        value: Buffer;
    }>>;
    private track;
    private decompressEvent;
    private removeKeys;
}
