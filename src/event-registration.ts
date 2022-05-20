import { given } from "@nivinjoseph/n-defensive";
import { ClassHierarchy } from "@nivinjoseph/n-util";
import { EdaEventHandler } from "./eda-event-handler";
import { eventSymbol } from "./event";

// public
export class EventRegistration
{
    private readonly _eventType: Function;
    private readonly _eventTypeName: string;
    private readonly _eventHandlerTypeName: string;
    private readonly _eventHandlerType: ClassHierarchy<EdaEventHandler<any>>;


    public get eventType(): Function { return this._eventType; }
    public get eventTypeName(): string { return this._eventTypeName; }
    public get eventHandlerTypeName(): string { return this._eventHandlerTypeName; }
    public get eventHandlerType(): ClassHierarchy<EdaEventHandler<any>> { return this._eventHandlerType; }


    public constructor(eventHandlerType: ClassHierarchy<EdaEventHandler<any>>)
    {
        given(eventHandlerType, "eventHandlerType").ensureHasValue().ensureIsFunction()
            .ensure(t => Reflect.hasOwnMetadata(eventSymbol, t),
                `EventHandler '${(<Object>eventHandlerType).getTypeName()}' does not have event applied.`);

        this._eventHandlerTypeName = (<Object>eventHandlerType).getTypeName();
        this._eventHandlerType = eventHandlerType;

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