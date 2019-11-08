import { given } from "@nivinjoseph/n-defensive";
import { Container, Registry, ServiceLocator, ComponentInstaller } from "@nivinjoseph/n-ject";
import { ApplicationException, ObjectDisposedException } from "@nivinjoseph/n-exception";
import { EventBus } from "./event-bus";
import { EventSubMgr } from "./event-sub-mgr";
import { Disposable } from "@nivinjoseph/n-util";
import { EventRegistration } from "./event-registration";
import { Topic } from "./topic";
import { EdaEvent } from "./eda-event";
import * as MurmurHash from "murmurhash3js";

// public
export class EdaManager implements Disposable
{
    private readonly _container: Container;
    private readonly _topics: Array<Topic>;
    private readonly _topicMap: Map<string, Topic>;
    private readonly _eventMap: Map<string, EventRegistration>;
    
    private _partitionKeyMapper: (event: EdaEvent) => string = null as any;
    private _eventBusRegistered = false;
    private _eventSubMgrRegistered = false;
    private _consumerGroupId: string | null = null;
    private _isDisposed = false;
    private _isBootstrapped = false;
    
    
    public static get eventBusKey(): string { return "EventBus"; }
    public static get eventSubMgrKey(): string { return "EventSubMgr"; }
    
    public get containerRegistry(): Registry { return this._container; }
    public get serviceLocator(): ServiceLocator { return this._container; }
    public get topics(): ReadonlyArray<Topic> { return this._topics; }
    public get eventMap(): ReadonlyMap<string, EventRegistration> { return this._eventMap; }
    public get consumerGroupId(): string | null { return this._consumerGroupId; }
    
    
    public constructor()
    {   
        this._container = new Container();
        this._topics = new Array<Topic>();
        this._topicMap = new Map<string, Topic>();
        this._eventMap = new Map<string, EventRegistration>();
    }
    
    
    public useInstaller(installer: ComponentInstaller): this
    {
        given(installer, "installer").ensureHasValue().ensureIsObject();
        given(this, "this").ensure(t => !t._isBootstrapped, "invoking method after bootstrap");

        this._container.install(installer);
        return this;
    }
    
    public registerTopics(...topics: Topic[]): this
    {
        given(topics, "topics").ensureHasValue().ensureIsArray();
        given(this, "this").ensure(t => !t._isBootstrapped, "invoking method after bootstrap");

        for (let topic of topics)
        {
            const name = topic.name.toLowerCase();
            if (this._topics.some(t => t.name.toLowerCase() === name))
                throw new ApplicationException(`Multiple topics with the name '${name}' detected.`);

            this._topics.push(topic);
        }

        return this;
    }
    
    public usePartitionKeyMapper(func: (event: EdaEvent) => string): this
    {
        given(func, "func").ensureHasValue().ensureIsFunction();
        given(this, "this")
            .ensure(t => !t._partitionKeyMapper, "partition key mapper already set")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        
        this._partitionKeyMapper = func;
        
        return this;
    }
    
    public registerEventHandlers(...eventHandlerClasses: Function[]): this
    {
        given(eventHandlerClasses, "eventHandlerClasses").ensureHasValue().ensureIsArray();
        given(this, "this").ensure(t => !t._isBootstrapped, "invoking method after bootstrap");

        for (let eventHandler of eventHandlerClasses)
        {
            const eventRegistration = new EventRegistration(eventHandler);
            
            if (this._eventMap.has(eventRegistration.eventTypeName))
                throw new ApplicationException(`Multiple handlers detected for event '${eventRegistration.eventTypeName}'.`);

            this._eventMap.set(eventRegistration.eventTypeName, eventRegistration);
        }
        
        return this;
    }
    
    public registerEventBus(eventBus: EventBus | Function): this
    {
        given(eventBus, "eventBus").ensureHasValue().ensure(t => typeof t === "function" || typeof t === "object");
        given(this, "this")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap")
            .ensure(t => !t._eventBusRegistered, "event bus already registered");
        
        if (typeof eventBus === "function")
            this._container.registerSingleton(EdaManager.eventBusKey, eventBus);
        else
            this._container.registerInstance(EdaManager.eventBusKey, eventBus);
        
        this._eventBusRegistered = true;
        
        return this;
    }
    
    public registerEventSubscriptionManager(eventSubMgr: EventSubMgr | Function, consumerGroupId: string): this
    {
        given(eventSubMgr, "eventSubMgr").ensureHasValue().ensure(t => typeof t === "function" || typeof t === "object");
        given(consumerGroupId, "consumerGroupId").ensureHasValue().ensureIsString();
        given(this, "this")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap")
            .ensure(t => !t._eventSubMgrRegistered, "event subscription manager already registered");
        
        if (typeof eventSubMgr === "function")
            this._container.registerSingleton(EdaManager.eventSubMgrKey, eventSubMgr);
        else
            this._container.registerInstance(EdaManager.eventSubMgrKey, eventSubMgr);
        
        this._consumerGroupId = consumerGroupId.trim();
        this._eventSubMgrRegistered = true;
        
        return this;
    }
    
    public bootstrap(): void
    {    
        if (this._isDisposed)
            throw new ObjectDisposedException(this);
        
        given(this, "this")
            .ensure(t => !t._isBootstrapped, "bootstrapping more than once")
            .ensure(t => t._eventBusRegistered, "no event bus registered")
            .ensure(t => !!t._partitionKeyMapper, "no partition key mapper set");
        
        this._topics.map(t => this._topicMap.set(t.name, t));
        
        const keys = [...this._eventMap.keys()];
        this._eventMap.forEach(t =>
        {
            if (t.isWild)
            {
                const conflicts = keys.filter(u => u !== t.eventTypeName && u.startsWith(t.eventTypeName));
                if (conflicts.length > 0)
                    throw new ApplicationException(`Handler conflict detected between wildcard '${t.eventTypeName}' and events '${conflicts.join(",")}'.`);
            }

            this._container.registerScoped(t.eventHandlerTypeName, t.eventHandlerType);
        });
        
        this._container.bootstrap();
        
        if (this._eventSubMgrRegistered)
            this._container.resolve<EventSubMgr>(EdaManager.eventSubMgrKey)
                .initialize(this);
        
        this._isBootstrapped = true;
    }
    
    public mapToPartition(topic: string, event: EdaEvent): number
    {
        given(topic, "topic").ensureHasValue().ensureIsString()
            .ensure(t => this._topicMap.has(t));
        given(event, "event").ensureHasValue().ensureIsObject();
        
        if (this._isDisposed)
            throw new ObjectDisposedException(this);

        given(this, "this")
            .ensure(t => t._isBootstrapped, "not bootstrapped");
        
        const partitionKey = this._partitionKeyMapper(event);
        
        return MurmurHash.x86.hash32(partitionKey) % (this._topicMap.get(topic) as Topic).numPartitions;
    }
    
    public async dispose(): Promise<void>
    {
        if (this._isDisposed)
            return;
        
        this._isDisposed = true;
        
        await this._container.dispose();
    }
    
    
    // private createEventMap(eventHandlerClasses: ReadonlyArray<Function>): Map<string, EventRegistration>
    // {
    //     given(eventHandlerClasses, "eventHandlerClasses").ensureHasValue().ensureIsArray();

    //     const eventRegistrations = eventHandlerClasses.map(t => new EventRegistration(t));
    //     const eventMap = new Map<string, EventRegistration>();

    //     eventRegistrations.forEach(t =>
    //     {
    //         if (eventMap.has(t.eventTypeName))
    //             throw new ApplicationException(`Multiple handlers detected for event '${t.eventTypeName}'.`);
            
    //         eventMap.set(t.eventTypeName, t);
    //     });
        
    //     const keys = [...eventMap.keys()];
        
    //     eventMap.forEach(t =>
    //     {
    //         if (t.isWild)
    //         {
    //             const conflicts = keys.filter(u => u !== t.eventTypeName && u.startsWith(t.eventTypeName));
    //             if (conflicts.length > 0)
    //                 throw new ApplicationException(`Handler conflict detected between wildcard '${t.eventTypeName}' and events '${conflicts.join(",")}'.`);    
    //         }
            
    //         this._container.registerScoped(t.eventHandlerTypeName, t.eventHandlerType);
    //     });
        
    //     return eventMap;
    // }
    
    // private registerBusAndMgr(eventBus: EventBus | Function, eventSubMgr: EventSubMgr | Function): void
    // {
    //     given(eventBus, "eventBus").ensureHasValue().ensure(t => typeof t === "function" || typeof t === "object");
    //     given(eventSubMgr, "eventSubMgr").ensureHasValue().ensure(t => typeof t === "function" || typeof t === "object");

    //     if (typeof eventBus === "function")
    //         this._container.registerSingleton(EdaManager.eventBusKey, eventBus);
    //     else
    //         this._container.registerInstance(EdaManager.eventBusKey, eventBus);

    //     if (typeof eventSubMgr === "function")
    //         this._container.registerSingleton(EdaManager.eventSubMgrKey, eventSubMgr);
    //     else
    //         this._container.registerInstance(EdaManager.eventSubMgrKey, eventSubMgr);
    // }
}