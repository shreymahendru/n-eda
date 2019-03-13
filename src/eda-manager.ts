import { EdaConfig } from "./eda-config";
import { given } from "@nivinjoseph/n-defensive";
import { Container, Registry } from "@nivinjoseph/n-ject";
import { EventMap } from "./event-map";
import { eventSymbol } from "./event";
import { ApplicationException, ObjectDisposedException } from "@nivinjoseph/n-exception";
import { EventBus } from "./event-bus";
import { EventSubMgr } from "./event-sub-mgr";
import { Disposable } from "@nivinjoseph/n-util";

// public
export class EdaManager implements Disposable
{
    private readonly _container: Container;
    private readonly _eventMap: EventMap;
    
    private _isDisposed = false;
    
    
    public static get eventBusKey(): string { return "EventBus"; }
    public static get eventSubMgrKey(): string { return "EventSubMgr"; }
    
    public get containerRegistry(): Registry { return this._container; }
    
    
    public constructor(config: EdaConfig)
    {
        given(config, "config").ensureHasValue().ensureIsObject();
        
        this._container = new Container();
        if (config.iocInstaller)
            this._container.install(config.iocInstaller);
        
        this._eventMap = this.createEventMap(config.eventHandlerClasses);
        this.registerBusAndMgr(config.eventBus, config.eventSubMgr);
    }
    
    
    public bootstrap(): void
    {
        if (this._isDisposed)
            throw new ObjectDisposedException(this);
        
        this._container.bootstrap();
        
        this._container.resolve<EventSubMgr>(EdaManager.eventSubMgrKey)
            .initialize(this._container, this._eventMap);
    }
    
    public async dispose(): Promise<void>
    {
        if (this._isDisposed)
            return;
        
        this._isDisposed = true;
        
        await this._container.dispose();
    }
    
    
    private createEventMap(eventHandlerClasses: ReadonlyArray<Function>): EventMap
    {
        given(eventHandlerClasses, "eventHandlerClasses").ensureHasValue().ensureIsArray();

        const eventRegistrations = eventHandlerClasses.map(t => new EventHandlerRegistration(t));
        const eventMap: EventMap = {};

        eventRegistrations.forEach(t =>
        {
            if (eventMap[t.eventTypeName])
                throw new ApplicationException(`Multiple handlers detected for event '${t.eventTypeName}'.`);

            eventMap[t.eventTypeName] = t.eventHandlerTypeName;
            this._container.registerScoped(t.eventHandlerTypeName, t.eventHandlerType);
        });
        
        return eventMap;
    }
    
    private registerBusAndMgr(eventBus: EventBus | Function, eventSubMgr: EventSubMgr | Function): void
    {
        given(eventBus, "eventBus").ensureHasValue().ensure(t => typeof t === "function" || typeof t === "object");
        given(eventSubMgr, "eventSubMgr").ensureHasValue().ensure(t => typeof t === "function" || typeof t === "object");

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


class EventHandlerRegistration
{
    private readonly _eventTypeName: string;
    private readonly _eventHandlerTypeName: string;
    private readonly _eventHandlerType: Function;


    public get eventTypeName(): string { return this._eventTypeName; }
    public get eventHandlerTypeName(): string { return this._eventHandlerTypeName; }
    public get eventHandlerType(): Function { return this._eventHandlerType; }


    public constructor(eventHandlerType: Function)
    {
        given(eventHandlerType, "eventHandlerType").ensureHasValue().ensureIsFunction();

        this._eventHandlerTypeName = (<Object>eventHandlerType).getTypeName();
        this._eventHandlerType = eventHandlerType;

        if (!Reflect.hasOwnMetadata(eventSymbol, this._eventHandlerType))
            throw new ApplicationException("EventHandler '{0}' does not have event applied."
                .format(this._eventHandlerTypeName));

        this._eventTypeName = Reflect.getOwnMetadata(eventSymbol, this._eventHandlerType);
    }
}