import { EventBus } from "../event-bus";
import { EdaEvent } from "../eda-event";
import { given } from "@nivinjoseph/n-defensive";
import { ObjectDisposedException } from "@nivinjoseph/n-exception";

// public
export class InMemoryEventBus implements EventBus
{
    private _isDisposed = false;
    private _onPublish: (e: EdaEvent) => void = null as any;
    
    
    public async publish(event: EdaEvent): Promise<void>
    {
        if (this._isDisposed)
            throw new ObjectDisposedException(this);
        
        given(event, "event").ensureHasValue()
            .ensureHasStructure({
                id: "string",
                name: "string",
            });   
        
        given(this, "this").ensure(t => !!t._onPublish, "onPublish callback has not been registered");
        
        this._onPublish(event);
    }
    
    public onPublish(callback: (e: EdaEvent) => void): void
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