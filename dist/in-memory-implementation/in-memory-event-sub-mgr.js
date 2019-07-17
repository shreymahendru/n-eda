"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const n_ject_1 = require("@nivinjoseph/n-ject");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_util_1 = require("@nivinjoseph/n-util");
const in_memory_event_bus_1 = require("./in-memory-event-bus");
const n_exception_1 = require("@nivinjoseph/n-exception");
const eda_manager_1 = require("../eda-manager");
let InMemoryEventSubMgr = class InMemoryEventSubMgr {
    constructor(logger) {
        this._isDisposed = false;
        this._isInitialized = false;
        n_defensive_1.given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;
        this._processor = new n_util_1.BackgroundProcessor((e) => this._logger.logError(e));
    }
    initialize(container, eventMap) {
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException(this);
        n_defensive_1.given(container, "container").ensureHasValue().ensureIsType(n_ject_1.Container);
        n_defensive_1.given(eventMap, "eventMap").ensureHasValue().ensureIsObject();
        n_defensive_1.given(this, "this").ensure(t => !t._isInitialized, "initializing more than once");
        const inMemoryEventBus = container.resolve(eda_manager_1.EdaManager.eventBusKey);
        if (!(inMemoryEventBus instanceof in_memory_event_bus_1.InMemoryEventBus))
            throw new n_exception_1.ApplicationException("InMemoryEventSubMgr can only work with InMemoryEventBus.");
        const wildKeys = [...eventMap.values()].filter(t => t.isWild).map(t => t.eventTypeName);
        inMemoryEventBus.onPublish((e) => {
            let eventRegistration = null;
            if (eventMap.has(e.name))
                eventRegistration = eventMap.get(e.name);
            else {
                const wildKey = wildKeys.find(t => e.name.startsWith(t));
                if (wildKey)
                    eventRegistration = eventMap.get(wildKey);
            }
            if (!eventRegistration)
                return;
            const scope = container.createScope();
            e.$scope = scope;
            this.onEventReceived(scope, e);
            const handler = scope.resolve(eventRegistration.eventHandlerTypeName);
            this._processor.processAction(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    yield handler.handle(e);
                }
                finally {
                    yield scope.dispose();
                }
            }));
        });
        this._isInitialized = true;
    }
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._isDisposed)
                return;
            this._isDisposed = true;
            yield this._processor.dispose(false);
        });
    }
    onEventReceived(scope, event) {
        n_defensive_1.given(scope, "scope").ensureHasValue().ensureIsObject();
        n_defensive_1.given(event, "event").ensureHasValue().ensureIsObject();
    }
};
InMemoryEventSubMgr = __decorate([
    n_ject_1.inject("Logger"),
    __metadata("design:paramtypes", [Object])
], InMemoryEventSubMgr);
exports.InMemoryEventSubMgr = InMemoryEventSubMgr;
//# sourceMappingURL=in-memory-event-sub-mgr.js.map