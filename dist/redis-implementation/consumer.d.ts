/// <reference types="node" />
import { Disposable } from "@nivinjoseph/n-util";
import * as Redis from "redis";
import { EdaManager } from "../eda-manager";
import { EventRegistration } from "../event-registration";
import { EdaEvent } from "../eda-event";
import { ServiceLocator } from "@nivinjoseph/n-ject";
import { Logger } from "@nivinjoseph/n-log";
export declare class Consumer implements Disposable {
    private readonly _edaPrefix;
    private readonly _defaultDelayMS;
    private readonly _client;
    private readonly _manager;
    private readonly _logger;
    private readonly _topic;
    private readonly _partition;
    private readonly _cleanKeys;
    private readonly _onEventReceived;
    private _isDisposed;
    private _trackedIdsSet;
    private _trackedIdsArray;
    private _trackedKeysArray;
    private _consumePromise;
    protected get manager(): EdaManager;
    protected get topic(): string;
    protected get partition(): number;
    protected get logger(): Logger;
    protected get trackedIdsSet(): ReadonlySet<string>;
    protected get isDisposed(): boolean;
    constructor(client: Redis.RedisClient, manager: EdaManager, topic: string, partition: number, onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void);
    consume(): void;
    dispose(): Promise<void>;
    protected beginConsume(): Promise<void>;
    protected fetchPartitionWriteIndex(): Promise<number>;
    protected fetchConsumerPartitionReadIndex(): Promise<number>;
    protected incrementConsumerPartitionReadIndex(): Promise<number>;
    protected retrieveEvent(key: string): Promise<Buffer>;
    protected batchRetrieveEvents(lowerBoundIndex: number, upperBoundIndex: number): Promise<Array<{
        index: number;
        key: string;
        value: Buffer;
    }>>;
    protected processEvent(eventName: string, eventRegistration: EventRegistration, event: any, eventId: string, numAttempt: number): Promise<void>;
    protected track(eventId: string, eventKey: string): Promise<void>;
    protected decompressEvent(eventData: Buffer): Promise<object>;
    protected removeKeys(keys: string[]): Promise<void>;
}
