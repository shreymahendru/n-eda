import { given } from "@nivinjoseph/n-defensive";
import { ObjectDisposedException } from "@nivinjoseph/n-exception";
export class Monitor {
    constructor(client, consumers, logger) {
        this._consumers = new Map();
        this._isRunning = false;
        this._isDisposed = false;
        given(client, "client").ensureHasValue().ensureIsObject();
        this._client = client.duplicate();
        given(consumers, "consumers").ensureHasValue().ensureIsArray().ensureIsNotEmpty();
        consumers.forEach(consumer => {
            this._consumers.set(consumer.id, consumer);
        });
        given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;
        this._listener = (_channel, id) => {
            // console.log(_channel, id);
            this._consumers.get(id).awaken();
        };
    }
    async start() {
        if (this._isDisposed)
            throw new ObjectDisposedException("Monitor");
        if (this._isRunning)
            return;
        this._isRunning = true;
        await this._client.subscribe(...[...this._consumers.values()].map(t => `${t.id}-changed`));
        this._client.on("message", this._listener);
    }
    async dispose() {
        this._isRunning = false;
        if (this._isDisposed)
            return;
        this._isDisposed = true;
        this._client.off("message", this._listener);
        await this._client.unsubscribe(...[...this._consumers.values()].map(t => `${t.id}-changed`));
        await this._client.quit();
    }
}
//# sourceMappingURL=monitor.js.map