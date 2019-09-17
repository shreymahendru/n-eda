import { EventSubMgr } from "../event-sub-mgr";
import { Container, inject, Scope } from "@nivinjoseph/n-ject";
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
    private readonly _processors: ReadonlyArray<BackgroundProcessor>;
    private _processorIndex = 0;
    private _isDisposed = false;
    private _isInitialized = false;


    public constructor(logger: Logger, processorCount: number = 25)
    {
        given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;
        
        given(processorCount, "processorCount").ensureHasValue().ensureIsNumber().ensure(t => t > 0);
        
        const processors = new Array<BackgroundProcessor>();
        Make.loop(() => processors.push(new BackgroundProcessor((e) => this._logger.logError(e as any))), processorCount);
        this._processors = processors;
    }
    
    
    public initialize(container: Container, eventMap: ReadonlyMap<string, EventRegistration>): void
    {
        if (this._isDisposed)
            throw new ObjectDisposedException(this);
        
        given(container, "container").ensureHasValue().ensureIsType(Container);
        given(eventMap, "eventMap").ensureHasValue().ensureIsObject();
        given(this, "this").ensure(t => !t._isInitialized, "initializing more than once");
        
        const inMemoryEventBus = container.resolve<InMemoryEventBus>(EdaManager.eventBusKey);
        if (!(inMemoryEventBus instanceof InMemoryEventBus))
            throw new ApplicationException("InMemoryEventSubMgr can only work with InMemoryEventBus.");
        
        const wildKeys = [...eventMap.values()].filter(t => t.isWild).map(t => t.eventTypeName);
        
        inMemoryEventBus.onPublish((events) =>
        {   
            if (this._isDisposed)
                throw new ObjectDisposedException(this);
            
            const processor = this._processors[this._processorIndex];
            let isUsed = false;
            
            events.forEach(e =>
            {
                let eventRegistration: EventRegistration | null = null;
                if (eventMap.has(e.name))
                    eventRegistration = eventMap.get(e.name) as EventRegistration;
                else
                {
                    const wildKey = wildKeys.find(t => e.name.startsWith(t));
                    if (wildKey)
                        eventRegistration = eventMap.get(wildKey) as EventRegistration;
                }

                if (!eventRegistration)
                    return;

                const scope = container.createScope();
                (<any>e).$scope = scope;

                this.onEventReceived(scope, e);

                const handler = scope.resolve<EdaEventHandler<EdaEvent>>(eventRegistration.eventHandlerTypeName);
                processor.processAction(async () =>
                {
                    try 
                    {
                        await handler.handle(e);
                    }
                    finally
                    {
                        await scope.dispose();
                    }
                });
                
                isUsed = true;
            });
            
            if (isUsed)
                this.rotateProcessor();
        });
        
        this._isInitialized = true;
    }
    
    public async dispose(): Promise<void>
    {
        if (this._isDisposed)
            return;
        
        this._isDisposed = true;
        
        await Promise.all(this._processors.map(t => t.dispose(false)));
    }
    
    protected onEventReceived(scope: Scope, event: EdaEvent): void
    {
        given(scope, "scope").ensureHasValue().ensureIsObject();
        given(event, "event").ensureHasValue().ensureIsObject();
    }
    
    private rotateProcessor(): void
    {
        if (this._processorIndex < (this._processors.length - 1))
            this._processorIndex++;
        else
            this._processorIndex = 0;
    }
}