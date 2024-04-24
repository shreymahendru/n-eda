import { given } from "@nivinjoseph/n-defensive";
import { ObjectDisposedException } from "@nivinjoseph/n-exception";
// import { DefaultScheduler } from "./default-scheduler.js";
import { OptimizedScheduler } from "./optimized-scheduler.js";
export class Broker {
    constructor(consumers, processors) {
        this._isDisposed = false;
        given(consumers, "consumers").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty);
        this._consumers = consumers;
        given(processors, "processors").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty)
            .ensure(t => t.length === consumers.length, "length has to match consumers length");
        this._processors = processors;
        this._scheduler = new OptimizedScheduler(processors);
    }
    initialize() {
        this._consumers.forEach(t => t.registerBroker(this));
        this._consumers.forEach(t => t.consume());
    }
    route(routedEvent) {
        if (this._isDisposed)
            return Promise.reject(new ObjectDisposedException("Broker"));
        return this._scheduler.scheduleWork(routedEvent);
    }
    async dispose() {
        // console.warn("Disposing broker");
        this._isDisposed = true;
        await Promise.all([
            ...this._consumers.map(t => t.dispose()),
            ...this._processors.map(t => t.dispose()),
            this._scheduler.dispose()
        ])
            .then(() => {
            // console.warn("Broker disposed");
        })
            .catch(e => console.error(e));
    }
}
//# sourceMappingURL=broker.js.map