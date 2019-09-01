import { EventBus } from "../event-bus";
import { EdaEvent } from "../eda-event";
import { given } from "@nivinjoseph/n-defensive";
import { ObjectDisposedException } from "@nivinjoseph/n-exception";

// public
export class InMemoryEventBus implements EventBus
{
    private _isDisposed = false;
    private _onPublish: (events: ReadonlyArray<EdaEvent>) => void = null as any;
    
    
    public async publish(...events: EdaEvent[]): Promise<void>
    {
        if (this._isDisposed)
            throw new ObjectDisposedException(this);
        
        given(events, "events").ensureHasValue().ensureIsArray();
        
        events.forEach(event => given(event, "event")
            .ensureHasValue()
            .ensureIsObject()
            .ensureHasStructure({
                id: "string",
                name: "string",
            }));   
        
        given(this, "this").ensure(t => !!t._onPublish, "onPublish callback has not been registered");
        
        this._onPublish(events);
    }
    
    public onPublish(callback: (events: ReadonlyArray<EdaEvent>) => void): void
    {
        if (this._isDisposed)
            throw new ObjectDisposedException(this);
        
        given(callback, "callback").ensureHasValue().ensureIsFunction();
        given(this, "this").ensure(t => !t._onPublish, "setting onPublish callback more than once");
        
        this._onPublish = callback;
    }
    
    public async dispose(): Promise<void>
    {
        if (this._isDisposed)
            return;
        
        this._isDisposed = true;
        
        this._onPublish = null as any;
    }
}