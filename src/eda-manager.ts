import { EdaConfig } from "./eda-config";
import { given } from "@nivinjoseph/n-defensive";
import { Container } from "@nivinjoseph/n-ject";
import { EventMap } from "./event-map";
import { eventSymbol } from "./event";
import { ApplicationException } from "@nivinjoseph/n-exception";
import { EventBus } from "./event-bus";
import { EventSubMgr } from "./event-sub-mgr";
import { Disposable } from "@nivinjoseph/n-util";

// public
export class EdaManager implements Disposable
{
    private readonly _eventBusKey = "EventBus";
    private readonly _eventSubMgrKey = "EventSubMgr";
    private readonly _container: Container;
    private readonly _eventMap: EventMap;
    
    private readonly _eventBus: EventBus;
    private readonly _eventSubMgr: EventSubMgr;
    
    
    public get eventBusKey(): string { return this._eventBusKey; }
    public get eventBus(): EventBus { return this._eventBus; }
    
    public get eventSubMgrKey(): string { return this._eventSubMgrKey; }
    public get eventSubMgr(): EventSubMgr { return this._eventSubMgr; }
    
    
    public constructor(config: EdaConfig)
    {
        given(config, "config").ensureHasValue().ensureIsObject();
        
        this._container = new Container();
        if (config.iocInstaller)
            this._container.install(config.iocInstaller);
        
        this._eventMap = this.initialize(config.eventBus, config.eventSubMgr, config.eventHandlerClasses);
        
        this._eventBus = this._container.resolve<EventBus>(this._eventBusKey);
        this._eventSubMgr = this._container.resolve<EventSubMgr>(this._eventSubMgrKey);
        
        this._eventSubMgr.initialize(this._container, this._eventMap, this._eventBus);
    }
    
    
    public async dispose(): Promise<void>
    {
        await this._eventBus.dispose();
        await this._eventSubMgr.dispose();
    }
    
    
    private initialize(eventBus: EventBus | Function, eventSubMgr: EventSubMgr | Function,
        eventHandlerClasses: ReadonlyArray<Function>): EventMap
    {
        given(eventBus, "eventBus").ensureHasValue();
        given(eventSubMgr, "eventSubMgr").ensureHasValue();
        given(eventHandlerClasses, "eventHandlerClasses").ensureHasValue().ensureIsArray();
        
        if (typeof eventBus === "function")
            this._container.registerSingleton(this._eventBusKey, eventBus);
        else
            this._container.registerInstance(this._eventBusKey, eventBus);
        
        if (typeof eventSubMgr === "function")
            this._container.registerSingleton(this._eventSubMgrKey, eventSubMgr);
        else
            this._container.registerInstance(this._eventSubMgrKey, eventSubMgr);
        
        const eventRegistrations = eventHandlerClasses.map(t => new EventHandlerRegistration(t));
        const eventMap: EventMap = {};
        
        eventRegistrations.forEach(t =>
        {
            if (eventMap[t.eventTypeName])
                throw new ApplicationException(`Multiple handlers detected for event '${t.eventTypeName}'.`);
            
            eventMap[t.eventTypeName] = t.eventHandlerTypeName;
            this._container.registerScoped(t.eventHandlerTypeName, t.eventHandlerType);
        });
        
        this._container.bootstrap();
        
        return eventMap;
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