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
const n_ject_1 = require("@nivinjoseph/n-ject");
const n_exception_1 = require("@nivinjoseph/n-exception");
const event_registration_1 = require("./event-registration");
class EdaManager {
    constructor(config) {
        this._isDisposed = false;
        this._isBootstrapped = false;
        n_defensive_1.given(config, "config").ensureHasValue().ensureIsObject();
        this._container = new n_ject_1.Container();
        if (config.iocInstaller)
            this._container.install(config.iocInstaller);
        this._eventMap = this.createEventMap(config.eventHandlerClasses);
        this.registerBusAndMgr(config.eventBus, config.eventSubMgr);
    }
    static get eventBusKey() { return "EventBus"; }
    static get eventSubMgrKey() { return "EventSubMgr"; }
    get containerRegistry() { return this._container; }
    get serviceLocator() { return this._container; }
    bootstrap() {
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException(this);
        n_defensive_1.given(this, "this").ensure(t => !t._isBootstrapped, "bootstrapping more than once");
        this._container.bootstrap();
        this._container.resolve(EdaManager.eventSubMgrKey)
            .initialize(this._container, this._eventMap);
        this._isBootstrapped = true;
    }
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._isDisposed)
                return;
            this._isDisposed = true;
            yield this._container.dispose();
        });
    }
    createEventMap(eventHandlerClasses) {
        n_defensive_1.given(eventHandlerClasses, "eventHandlerClasses").ensureHasValue().ensureIsArray();
        const eventRegistrations = eventHandlerClasses.map(t => new event_registration_1.EventRegistration(t));
        const eventMap = new Map();
        eventRegistrations.forEach(t => {
            if (eventMap.has(t.eventTypeName))
                throw new n_exception_1.ApplicationException(`Multiple handlers detected for event '${t.eventTypeName}'.`);
            eventMap.set(t.eventTypeName, t);
        });
        const keys = [...eventMap.keys()];
        eventMap.forEach(t => {
            if (t.isWild) {
                const conflicts = keys.filter(u => u !== t.eventTypeName && u.startsWith(t.eventTypeName));
                if (conflicts.length > 0)
                    throw new n_exception_1.ApplicationException(`Handler conflict detected between wildcard '${t.eventTypeName}' and events '${conflicts.join(",")}'.`);
            }
            this._container.registerScoped(t.eventHandlerTypeName, t.eventHandlerType);
        });
        return eventMap;
    }
    registerBusAndMgr(eventBus, eventSubMgr) {
        n_defensive_1.given(eventBus, "eventBus").ensureHasValue().ensure(t => typeof t === "function" || typeof t === "object");
        n_defensive_1.given(eventSubMgr, "eventSubMgr").ensureHasValue().ensure(t => typeof t === "function" || typeof t === "object");
        if (typeof eventBus === "function")
            this._container.registerSingleton(EdaManager.eventBusKey, eventBus);
        else
            this._container.registerInstance(EdaManager.eventBusKey, eventBus);
        if (typeof eventSubMgr === "function")
            this._container.registerSingleton(EdaManager.eventSubMgrKey, eventSubMgr);
        else
            this._container.registerInstance(EdaManager.eventSubMgrKey, eventSubMgr);
    }
}
exports.EdaManager = EdaManager;
//# sourceMappingURL=eda-manager.js.map