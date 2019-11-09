import "reflect-metadata";
import { given } from "@nivinjoseph/n-defensive";
import "@nivinjoseph/n-ext";
// import { ArgumentException } from "@nivinjoseph/n-exception";


export const eventSymbol = Symbol("eventName");

// public
export function event(eventType: Function): Function
{
    given(eventType, "eventType").ensureHasValue().ensureIsFunction();
    
    // let eventName: string | null = null;
    
    // if (typeof eventType === "string")
    //     eventName = eventType.trim();
    // else if (typeof eventType === "function")
    //     eventName = (<Object>eventType).getTypeName();
    // else
    //     throw new ArgumentException("eventType", "must be an event class(Function) or event class name(string)");

    return (target: Function) => Reflect.defineMetadata(eventSymbol, eventType, target);
}