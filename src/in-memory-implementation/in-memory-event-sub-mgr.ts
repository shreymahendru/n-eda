import { EventSubMgr } from "../event-sub-mgr";
import { Container, inject, Scope } from "@nivinjoseph/n-ject";
import { EventMap } from "../event-map";
import { given } from "@nivinjoseph/n-defensive";
import { BackgroundProcessor } from "@nivinjoseph/n-util";
import { InMemoryEventBus } from "./in-memory-event-bus";
import { EdaEventHandler } from "../eda-event-handler";
import { EdaEvent } from "../eda-event";
import { Logger } from "@nivinjoseph/n-log";
import { ObjectDisposedException, ApplicationException } from "@nivinjoseph/n-exception";
import { EdaManager } from "../eda-manager";

// public
@inject("Logger")
export class InMemoryEventSubMgr implements EventSubMgr
{
    private readonly _logger: Logger;
    private readonly _processor: BackgroundProcessor;
    private _isDisposed = false;
    private _isInitialized = false;


    public constructor(logger: Logger)
    {
        given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;
        
        this._processor = new BackgroundProcessor((e) => this._logger.logError(e as any));
    }
    
    
    public initialize(container: Container, eventMap: EventMap): void
    {
        if (this._isDisposed)
            throw new ObjectDisposedException(this);
        
        given(container, "container").ensureHasValue().ensureIsType(Container);
        given(eventMap, "eventMap").ensureHasValue().ensureIsObject();
        given(this, "this").ensure(t => !t._isInitialized, "initializing more than once");
        
        const inMemoryEventBus = container.resolve<InMemoryEventBus>(EdaManager.eventBusKey);
        if (!(inMemoryEventBus instanceof InMemoryEventBus))
            throw new ApplicationException("InMemoryEventSubMgr can only work with InMemoryEventBus.");
        
        inMemoryEventBus.onPublish((e) =>
        {
            if (!eventMap[e.name])
                return;
            
            const scope = container.createScope();
            (<any>e).$scope = scope;
            
            this.onEventReceived(scope, e);
            
            const handler = scope.resolve<EdaEventHandler<EdaEvent>>(eventMap[e.name]);
            this._processor.processAction(async () =>
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
        });
        
        this._isInitialized = true;
    }
    
    public async dispose(): Promise<void>
    {
        if (this._isDisposed)
            return;
        
        this._isDisposed = true;
        
        await  this._processor.dispose(false);
    }
    
    protected onEventReceived(scope: Scope, event: EdaEvent): void
    {
        given(scope, "scope").ensureHasValue().ensureIsObject();
        given(event, "event").ensureHasValue().ensureIsObject();
    }
}