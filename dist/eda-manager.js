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
const event_1 = require("./event");
const n_exception_1 = require("@nivinjoseph/n-exception");
class EdaManager {
    constructor(config) {
        this._eventBusKey = "EventBus";
        this._eventSubMgrKey = "EventSubMgr";
        n_defensive_1.given(config, "config").ensureHasValue().ensureIsObject();
        this._container = new n_ject_1.Container();
        if (config.iocInstaller)
            this._container.install(config.iocInstaller);
        this._eventMap = this.initialize(config.eventBus, config.eventSubMgr, config.eventHandlerClasses);
        this._eventBus = this._container.resolve(this._eventBusKey);
        this._eventSubMgr = this._container.resolve(this._eventSubMgrKey);
        this._eventSubMgr.initialize(this._container, this._eventMap, this._eventBus);
    }
    get eventBusKey() { return this._eventBusKey; }
    get eventBus() { return this._eventBus; }
    get eventSubMgrKey() { return this._eventSubMgrKey; }
    get eventSubMgr() { return this._eventSubMgr; }
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._eventBus.dispose();
            yield this._eventSubMgr.dispose();
        });
    }
    initialize(eventBus, eventSubMgr, eventHandlerClasses) {
        n_defensive_1.given(eventBus, "eventBus").ensureHasValue();
        n_defensive_1.given(eventSubMgr, "eventSubMgr").ensureHasValue();
        n_defensive_1.given(eventHandlerClasses, "eventHandlerClasses").ensureHasValue().ensureIsArray();
        if (typeof eventBus === "function")
            this._container.registerSingleton(this._eventBusKey, eventBus);
        else
            this._container.registerInstance(this._eventBusKey, eventBus);
        if (typeof eventSubMgr === "function")
            this._container.registerSingleton(this._eventSubMgrKey, eventSubMgr);
        else
            this._container.registerInstance(this._eventSubMgrKey, eventSubMgr);
        const eventRegistrations = eventHandlerClasses.map(t => new EventHandlerRegistration(t));
        const eventMap = {};
        eventRegistrations.forEach(t => {
            if (eventMap[t.eventTypeName])
                throw new n_exception_1.ApplicationException(`Multiple handlers detected for event '${t.eventTypeName}'.`);
            eventMap[t.eventTypeName] = t.eventHandlerTypeName;
            this._container.registerScoped(t.eventHandlerTypeName, t.eventHandlerType);
        });
        this._container.bootstrap();
        return eventMap;
    }
}
exports.EdaManager = EdaManager;
class EventHandlerRegistration {
    get eventTypeName() { return this._eventTypeName; }
    get eventHandlerTypeName() { return this._eventHandlerTypeName; }
    get eventHandlerType() { return this._eventHandlerType; }
    constructor(eventHandlerType) {
        n_defensive_1.given(eventHandlerType, "eventHandlerType").ensureHasValue().ensureIsFunction();
        this._eventHandlerTypeName = eventHandlerType.getTypeName();
        this._eventHandlerType = eventHandlerType;
        if (!Reflect.hasOwnMetadata(event_1.eventSymbol, this._eventHandlerType))
            throw new n_exception_1.ApplicationException("EventHandler '{0}' does not have event applied."
                .format(this._eventHandlerTypeName));
        this._eventTypeName = Reflect.getOwnMetadata(event_1.eventSymbol, this._eventHandlerType);
    }
}
//# sourceMappingURL=eda-manager.js.map