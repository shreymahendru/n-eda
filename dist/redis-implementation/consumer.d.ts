import { Disposable } from "@nivinjoseph/n-util";
import * as Redis from "redis";
import { EdaManager } from "../eda-manager";
import { EdaEvent } from "../eda-event";
import { ServiceLocator } from "@nivinjoseph/n-ject";
export declare class Consumer implements Disposable {
    private readonly _edaPrefix;
    private readonly _client;
    private readonly _manager;
    private readonly _logger;
    private readonly _topic;
    private readonly _partition;
    private _isDisposed;
    private _consumePromise;
    constructor(client: Redis.RedisClient, manager: EdaManager, topic: string, partition: number);
    consume(): void;
    dispose(): Promise<void>;
    protected onEventReceived(scope: ServiceLocator, topic: string, event: EdaEvent): void;
    private beginConsume;
    private getPartitionWriteIndex;
    private getConsumerPartitionReadIndex;
    private incrementConsumerPartitionReadIndex;
    private retrieveEvent;
}
