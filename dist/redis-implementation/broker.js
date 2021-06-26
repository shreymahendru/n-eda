"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Broker = void 0;
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
const n_util_1 = require("@nivinjoseph/n-util");
const processor_1 = require("./processor");
class Broker {
    constructor(consumers, processors) {
        this._isDisposed = false;
        n_defensive_1.given(consumers, "consumers").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty);
        this._consumers = consumers;
        n_defensive_1.given(processors, "processors").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty)
            .ensure(t => t.length === consumers.length, "length has to match consumers length");
        this._scheduler = new Scheduler(processors);
    }
    initialize() {
        this._consumers.forEach(t => t.registerBroker(this));
        this._consumers.forEach(t => t.consume());
    }
    route(routedEvent) {
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException("Broker");
        return this._scheduler.scheduleWork(routedEvent);
    }
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            this._isDisposed = true;
            yield Promise.all(this._consumers.map(t => t.dispose()));
        });
    }
}
exports.Broker = Broker;
class Scheduler {
    constructor(processors) {
        this._queues = new Map();
        n_defensive_1.given(processors, "processors").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty);
        this._processors = processors;
        this._processors.forEach(t => t.initialize(this._onAvailable.bind(this)));
    }
    scheduleWork(routedEvent) {
        const deferred = new n_util_1.Deferred();
        const workItem = Object.assign(Object.assign({}, routedEvent), { deferred });
        if (this._queues.has(workItem.partitionKey))
            this._queues.get(workItem.partitionKey).queue.unshift(workItem);
        else
            this._queues.set(workItem.partitionKey, {
                partitionKey: workItem.partitionKey,
                lastAccessed: Date.now(),
                queue: [workItem]
            });
        this._executeAvailableWork();
        return workItem.deferred.promise;
    }
    _onAvailable(processor) {
        n_defensive_1.given(processor, "processor").ensureHasValue().ensureIsObject().ensureIsType(processor_1.Processor);
        this._executeAvailableWork(processor);
    }
    _executeAvailableWork(processor) {
        const availableProcessor = processor !== null && processor !== void 0 ? processor : this._processors.find(t => !t.isBusy);
        if (availableProcessor == null)
            return;
        let workItem = null;
        // FIXME: this is a shitty priority queue
        const entries = [...this._queues.values()].orderBy(t => t.lastAccessed);
        for (const entry of entries) {
            if (entry.queue.isEmpty) {
                this._queues.delete(entry.partitionKey);
                continue;
            }
            workItem = entry.queue.pop();
            if (entry.queue.isEmpty)
                this._queues.delete(entry.partitionKey);
            else
                entry.lastAccessed = Date.now();
            break;
        }
        if (workItem == null)
            return;
        availableProcessor.process(workItem);
    }
}
//# sourceMappingURL=broker.js.map