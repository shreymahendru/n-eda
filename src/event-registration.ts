import { given } from "@nivinjoseph/n-defensive";
import { ApplicationException } from "@nivinjoseph/n-exception";
import { eventSymbol } from "./event";

// public
export class EventRegistration
{
    private readonly _eventTypeName: string;
    private readonly _eventHandlerTypeName: string;
    private readonly _eventHandlerType: Function;
    private readonly _isWild: boolean;


    public get eventTypeName(): string { return this._eventTypeName; }
    public get eventHandlerTypeName(): string { return this._eventHandlerTypeName; }
    public get eventHandlerType(): Function { return this._eventHandlerType; }
    public get isWild(): boolean { return this._isWild; }


    public constructor(eventHandlerType: Function)
    {
        given(eventHandlerType, "eventHandlerType").ensureHasValue().ensureIsFunction();

        this._eventHandlerTypeName = (<Object>eventHandlerType).getTypeName();
        this._eventHandlerType = eventHandlerType;

        if (!Reflect.hasOwnMetadata(eventSymbol, this._eventHandlerType))
            throw new ApplicationException("EventHandler '{0}' does not have event applied."
                .format(this._eventHandlerTypeName));

        let eventTypeName: string = Reflect.getOwnMetadata(eventSymbol, this._eventHandlerType);
        eventTypeName = eventTypeName.trim();

        if (eventTypeName.endsWith("*"))
        {
            eventTypeName = eventTypeName.substr(0, eventTypeName.length - 1);
            this._isWild = true;
        }
        else
        {
            this._isWild = false;
        }

        this._eventTypeName = eventTypeName.trim();
    }
}