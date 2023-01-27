import { Consumer } from "./consumer";
import Redis from "ioredis";
import { Disposable } from "@nivinjoseph/n-util";
export declare class Monitor implements Disposable {
    private readonly _client;
    private readonly _consumers;
    private readonly _indexKeys;
    private _isRunning;
    private _isDisposed;
    private _runPromise;
    private _delayCanceller;
    constructor(client: Redis, consumers: ReadonlyArray<Consumer>);
    start(): void;
    dispose(): Promise<void>;
    private _run;
    private _fetchPartitionWriteAndConsumerPartitionReadIndexes;
}
