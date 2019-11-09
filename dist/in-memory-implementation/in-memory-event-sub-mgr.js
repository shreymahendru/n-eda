"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_util_1 = require("@nivinjoseph/n-util");
const in_memory_event_bus_1 = require("./in-memory-event-bus");
const n_exception_1 = require("@nivinjoseph/n-exception");
const eda_manager_1 = require("../eda-manager");
class InMemoryEventSubMgr {
    constructor() {
        this._consumers = new Map();
        this._isDisposed = false;
        this._manager = null;
        this._logger = null;
        this._isInitialized = false;
    }
    initialize(manager) {
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException(this);
        n_defensive_1.given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager);
        n_defensive_1.given(this, "this").ensure(t => !t._isInitialized, "initializing more than once");
        this._manager = manager;
        this._logger = this._manager.serviceLocator.resolve("Logger");
        this._manager.topics.forEach(topic => {
            const processors = new Array();
            n_util_1.Make.loop(() => processors.push(new n_util_1.BackgroundProcessor((e) => this._logger.logError(e))), topic.numPartitions);
            this._consumers.set(topic.name, processors);
        });
        const inMemoryEventBus = this._manager.serviceLocator.resolve(eda_manager_1.EdaManager.eventBusKey);
        if (!(inMemoryEventBus instanceof in_memory_event_bus_1.InMemoryEventBus))
            throw new n_exception_1.ApplicationException("InMemoryEventSubMgr can only work with InMemoryEventBus.");
        inMemoryEventBus.onPublish((topic, partition, event) => {
            if (this._isDisposed)
                throw new n_exception_1.ObjectDisposedException(this);
            const topicProcessors = this._consumers.get(topic);
            const processor = topicProcessors[partition];
            const eventRegistration = this._manager.eventMap.get(event.name);
            const scope = this._manager.serviceLocator.createScope();
            event.$scope = scope;
            try {
                this.onEventReceived(scope, topic, event);
                const handler = scope.resolve(eventRegistration.eventHandlerTypeName);
                processor.processAction(() => __awaiter(this, void 0, void 0, function* () {
                    try {
                        yield handler.handle(event);
                    }
                    finally {
                        yield scope.dispose();
                    }
                }));
            }
            catch (error) {
                this._logger.logError(error)
                    .then(() => scope.dispose())
                    .catch(() => { });
            }
        });
        this._isInitialized = true;
    }
    wait() {
        return __awaiter(this, void 0, void 0, function* () {
            while (!this._isDisposed) {
                yield n_util_1.Delay.seconds(2);
            }
        });
    }
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._isDisposed)
                return;
            this._isDisposed = true;
            yield Promise.all([...this._consumers.values()].reduce((acc, processors) => {
                acc.push(...processors.map(t => t.dispose(false)));
                return acc;
            }, new Array()));
        });
    }
    onEventReceived(scope, topic, event) {
        n_defensive_1.given(scope, "scope").ensureHasValue().ensureIsObject();
        n_defensive_1.given(topic, "topic").ensureHasValue().ensureIsString();
        n_defensive_1.given(event, "event").ensureHasValue().ensureIsObject();
    }
}
exports.InMemoryEventSubMgr = InMemoryEventSubMgr;
//# sourceMappingURL=in-memory-event-sub-mgr.js.map