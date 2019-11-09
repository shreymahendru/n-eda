import { given } from "@nivinjoseph/n-defensive";
import { ApplicationException } from "@nivinjoseph/n-exception";
import { eventSymbol } from "./event";

// public
export class EventRegistration
{
    private readonly _eventType: Function;
    private readonly _eventTypeName: string;
    private readonly _eventHandlerTypeName: string;
    private readonly _eventHandlerType: Function;


    public get eventType(): Function { return this._eventType; }
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

        this._eventType = Reflect.getOwnMetadata(eventSymbol, this._eventHandlerType);
        this._eventTypeName = (<Object>this._eventType).getTypeName();
        
        // let eventTypeName: string = Reflect.getOwnMetadata(eventSymbol, this._eventHandlerType);
        // eventTypeName = eventTypeName.trim();

        // if (eventTypeName.endsWith("*"))
        // {
        //     eventTypeName = eventTypeName.substr(0, eventTypeName.length - 1);
        //     this._isWild = true;
        // }
        // else
        // {
        //     this._isWild = false;
        // }

        // this._eventTypeName = eventTypeName.trim();
    }
}