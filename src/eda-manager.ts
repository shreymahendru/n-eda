import { EdaConfig } from "./eda-config";
import { given } from "@nivinjoseph/n-defensive";
import { Container, Registry, ServiceLocator } from "@nivinjoseph/n-ject";
import { ApplicationException, ObjectDisposedException } from "@nivinjoseph/n-exception";
import { EventBus } from "./event-bus";
import { EventSubMgr } from "./event-sub-mgr";
import { Disposable } from "@nivinjoseph/n-util";
import { EventRegistration } from "./event-registration";

// public
export class EdaManager implements Disposable
{
    private readonly _container: Container;
    private readonly _eventMap: ReadonlyMap<string, EventRegistration>;
    
    private _isDisposed = false;
    private _isBootstrapped = false;
    
    
    public static get eventBusKey(): string { return "EventBus"; }
    public static get eventSubMgrKey(): string { return "EventSubMgr"; }
    
    public get containerRegistry(): Registry { return this._container; }
    public get serviceLocator(): ServiceLocator { return this._container; }
    
    
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
        
        given(this, "this").ensure(t => !t._isBootstrapped, "bootstrapping more than once");
        
        this._container.bootstrap();
        
        this._container.resolve<EventSubMgr>(EdaManager.eventSubMgrKey)
            .initialize(this._container, this._eventMap);
        
        this._isBootstrapped = true;
    }
    
    public async dispose(): Promise<void>
    {
        if (this._isDisposed)
            return;
        
        this._isDisposed = true;
        
        await this._container.dispose();
    }
    
    
    private createEventMap(eventHandlerClasses: ReadonlyArray<Function>): Map<string, EventRegistration>
    {
        given(eventHandlerClasses, "eventHandlerClasses").ensureHasValue().ensureIsArray();

        const eventRegistrations = eventHandlerClasses.map(t => new EventRegistration(t));
        const eventMap = new Map<string, EventRegistration>();

        eventRegistrations.forEach(t =>
        {
            if (eventMap.has(t.eventTypeName))
                throw new ApplicationException(`Multiple handlers detected for event '${t.eventTypeName}'.`);
            
            eventMap.set(t.eventTypeName, t);
        });
        
        const keys = [...eventMap.keys()];
        
        eventMap.forEach(t =>
        {
            if (t.isWild)
            {
                const conflicts = keys.filter(u => u !== t.eventTypeName && u.startsWith(t.eventTypeName));
                if (conflicts.length > 0)
                    throw new ApplicationException(`Handler conflict detected between wildcard '${t.eventTypeName}' and events '${conflicts.join(",")}'.`);    
            }
            
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