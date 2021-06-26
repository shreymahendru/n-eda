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
exports.Scheduler = exports.Broker = void 0;
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
const n_util_1 = require("@nivinjoseph/n-util");
const eda_manager_1 = require("../eda-manager");
class Broker {
    constructor(manager, consumers, processors) {
        this._scheduler = new Scheduler();
        this._isDisposed = false;
        n_defensive_1.given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager);
        this._manager = manager;
        n_defensive_1.given(consumers, "consumers").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty);
        this._consumers = consumers;
        n_defensive_1.given(processors, "processors").ensureHasValue().ensureIsArray().ensure(t => t.isNotEmpty)
            .ensure(t => t.length === consumers.length, "length has to match consumers length");
        this._processors = processors;
    }
    initialize() {
        this._consumers.forEach(t => t.registerBroker(this));
        this._consumers.forEach(t => t.consume());
        this._processors.forEach(t => t.registerScheduler(this._scheduler));
        this._processors.forEach(t => t.process());
    }
    route(consumerId, topic, partition, eventName, eventRegistration, eventIndex, eventKey, eventId, event) {
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException("Broker");
        const partitionKey = this._manager.partitionKeyMapper(event);
        const deferred = new n_util_1.Deferred();
        this._scheduler.scheduleWork({
            consumerId,
            topic,
            partition,
            eventName,
            eventRegistration,
            eventIndex,
            eventKey,
            eventId,
            event,
            partitionKey,
            deferred
        });
        return deferred.promise;
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
    constructor() {
        this._queues = new Map();
    }
    scheduleWork(workItem) {
        if (this._queues.has(workItem.partitionKey)) {
            this._queues.get(workItem.partitionKey).unshift(workItem);
        }
        else {
            this._queues.set(workItem.partitionKey, [workItem]);
        }
    }
    next() {
        // TODO: make this round robin
        for (const entry of this._queues.entries()) {
            if (entry[1].isEmpty) {
                this._queues.delete(entry[0]);
                continue;
            }
            return entry[1].pop();
        }
        return null;
    }
}
exports.Scheduler = Scheduler;
//# sourceMappingURL=broker.js.map