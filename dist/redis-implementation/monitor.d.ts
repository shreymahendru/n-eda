import { Consumer } from "./consumer";
import Redis from "ioredis";
import { Disposable } from "@nivinjoseph/n-util";
import { Logger } from "@nivinjoseph/n-log";
export declare class Monitor implements Disposable {
    private readonly _client;
    private readonly _consumers;
    private readonly _logger;
    private readonly _listener;
    private _isRunning;
    private _isDisposed;
    constructor(client: Redis, consumers: ReadonlyArray<Consumer>, logger: Logger);
    start(): Promise<void>;
    dispose(): Promise<void>;
}
