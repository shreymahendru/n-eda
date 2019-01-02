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
Object.defineProperty(exports, "__esModule", { value: true });
const n_ject_1 = require("@nivinjoseph/n-ject");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_util_1 = require("@nivinjoseph/n-util");
const in_memory_event_bus_1 = require("./in-memory-event-bus");
let InMemoryEventSubMgr = class InMemoryEventSubMgr {
    constructor(logger) {
        n_defensive_1.given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;
        this._processor = new n_util_1.BackgroundProcessor((e) => this._logger.logError(e));
    }
    initialize(container, eventMap, eventBus) {
        n_defensive_1.given(container, "container").ensureHasValue().ensureIsType(n_ject_1.Container);
        n_defensive_1.given(eventMap, "eventMap").ensureHasValue().ensureIsObject();
        n_defensive_1.given(eventBus, "eventBus").ensureHasValue().ensureIsType(in_memory_event_bus_1.InMemoryEventBus);
        const inMemoryEventBus = eventBus;
        inMemoryEventBus.onPublish((e) => {
            if (!eventMap[e.name])
                return;
            const scope = container.createScope();
            e.$scope = scope;
            const handler = scope.resolve(eventMap[e.name]);
            this._processor.processAction(() => handler.handle(e));
        });
    }
    dispose() {
        return this._processor.dispose(false);
    }
};
InMemoryEventSubMgr = __decorate([
    n_ject_1.inject("Logger"),
    __metadata("design:paramtypes", [Object])
], InMemoryEventSubMgr);
exports.InMemoryEventSubMgr = InMemoryEventSubMgr;
//# sourceMappingURL=in-memory-event-sub-mgr.js.map