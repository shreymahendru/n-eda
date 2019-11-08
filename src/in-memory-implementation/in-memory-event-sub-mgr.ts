import { EventSubMgr } from "../event-sub-mgr";
import { inject, ServiceLocator } from "@nivinjoseph/n-ject";
import { given } from "@nivinjoseph/n-defensive";
import { BackgroundProcessor, Make } from "@nivinjoseph/n-util";
import { InMemoryEventBus } from "./in-memory-event-bus";
import { EdaEventHandler } from "../eda-event-handler";
import { EdaEvent } from "../eda-event";
import { Logger } from "@nivinjoseph/n-log";
import { ObjectDisposedException, ApplicationException } from "@nivinjoseph/n-exception";
import { EdaManager } from "../eda-manager";
import { EventRegistration } from "../event-registration";

// public
@inject("Logger")
export class InMemoryEventSubMgr implements EventSubMgr
{
    private readonly _logger: Logger;
    private readonly _consumers = new Map<string, Array<BackgroundProcessor>>();
    private _isDisposed = false;
    private _edaManager: EdaManager = null as any;
    private _isInitialized = false;


    public constructor(logger: Logger)
    {
        given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;
    }
    
    
    public initialize(manager: EdaManager): void
    {
        if (this._isDisposed)
            throw new ObjectDisposedException(this);
        
        given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(EdaManager);
        given(this, "this").ensure(t => !t._isInitialized, "initializing more than once");
        
        this._edaManager = manager;
        
        this._edaManager.topics.forEach(topic =>
        {
            const processors = new Array<BackgroundProcessor>();
            Make.loop(() => processors.push(new BackgroundProcessor((e) => this._logger.logError(e as any))), topic.numPartitions);
            this._consumers.set(topic.name, processors);
        });
        
        const inMemoryEventBus = this._edaManager.serviceLocator.resolve<InMemoryEventBus>(EdaManager.eventBusKey);
        if (!(inMemoryEventBus instanceof InMemoryEventBus))
            throw new ApplicationException("InMemoryEventSubMgr can only work with InMemoryEventBus.");
        
        const wildKeys = [...this._edaManager.eventMap.values()].filter(t => t.isWild).map(t => t.eventTypeName);
        
        inMemoryEventBus.onPublish((topic: string, partition: number, event: EdaEvent) =>
        {   
            if (this._isDisposed)
                throw new ObjectDisposedException(this);
            
            const topicProcessors = this._consumers.get(topic) as ReadonlyArray<BackgroundProcessor>;
            const processor = topicProcessors[partition];
            
            let eventRegistration: EventRegistration | null = null;
            if (this._edaManager.eventMap.has(event.name))
                eventRegistration = this._edaManager.eventMap.get(event.name) as EventRegistration;
            else
            {
                const wildKey = wildKeys.find(t => event.name.startsWith(t));
                if (wildKey)
                    eventRegistration = this._edaManager.eventMap.get(wildKey) as EventRegistration;
            }

            if (!eventRegistration)
                return;

            const scope = this._edaManager.serviceLocator.createScope();
            (<any>event).$scope = scope;

            try 
            {
                this.onEventReceived(scope, topic, event);

                const handler = scope.resolve<EdaEventHandler<EdaEvent>>(eventRegistration.eventHandlerTypeName);
                processor.processAction(async () =>
                {
                    try 
                    {
                        await handler.handle(event);
                    }
                    finally
                    {
                        await scope.dispose();
                    }
                });
            }
            catch (error)
            {
                this._logger.logError(error)
                    .then(() => scope.dispose())
                    .catch(() => { });
            }
        });
        
        this._isInitialized = true;
    }
    
    public async dispose(): Promise<void>
    {
        if (this._isDisposed)
            return;
        
        this._isDisposed = true;
        
        await Promise.all([...this._consumers.values()].reduce((acc, processors) =>
        {
            acc.push(...processors.map(t => t.dispose(false)));
            return acc;
        }, new Array<Promise<void>>()));
    }
    
    protected onEventReceived(scope: ServiceLocator, topic: string, event: EdaEvent): void
    {
        given(scope, "scope").ensureHasValue().ensureIsObject();
        given(topic, "topic").ensureHasValue().ensureIsString();
        given(event, "event").ensureHasValue().ensureIsObject();
    }
    
    // private rotateProcessor(): void
    // {
    //     if (this._processorIndex < (this._processors.length - 1))
    //         this._processorIndex++;
    //     else
    //         this._processorIndex = 0;
    // }
}