import { EventSubMgr } from "../event-sub-mgr";
import { Container, inject } from "@nivinjoseph/n-ject";
import { EventMap } from "../event-map";
import { EventBus } from "../event-bus";
import { given } from "@nivinjoseph/n-defensive";
import { BackgroundProcessor } from "@nivinjoseph/n-util";
import { InMemoryEventBus } from "./in-memory-event-bus";
import { EdaEventHandler } from "../eda-event-handler";
import { EdaEvent } from "../eda-event";
import { Logger } from "@nivinjoseph/n-log";
import { ObjectDisposedException } from "@nivinjoseph/n-exception";

// public
@inject("Logger")
export class InMemoryEventSubMgr implements EventSubMgr
{
    private readonly _logger: Logger;
    private readonly _processor: BackgroundProcessor;
    private _isDisposed = false;


    public constructor(logger: Logger)
    {
        given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;
        
        this._processor = new BackgroundProcessor((e) => this._logger.logError(e as any));
    }
    
    
    public initialize(container: Container, eventMap: EventMap, eventBus: EventBus): void
    {
        if (this._isDisposed)
            throw new ObjectDisposedException(this);
        
        given(container, "container").ensureHasValue().ensureIsType(Container);
        given(eventMap, "eventMap").ensureHasValue().ensureIsObject();
        given(eventBus, "eventBus").ensureHasValue().ensureIsType(InMemoryEventBus);
        
        const inMemoryEventBus = eventBus as InMemoryEventBus;
        inMemoryEventBus.onPublish((e) =>
        {
            if (!eventMap[e.name])
                return;
            
            const scope = container.createScope();
            (<any>e).$scope = scope;
            const handler = scope.resolve<EdaEventHandler<EdaEvent>>(eventMap[e.name]);
            
            this._processor.processAction(() => handler.handle(e));
        });
    }
    
    public async dispose(): Promise<void>
    {
        if (this._isDisposed)
            return;
        
        this._isDisposed = true;
        
        await  this._processor.dispose(false);
    }
}