import "reflect-metadata";
import { given } from "@nivinjoseph/n-defensive";
import "@nivinjoseph/n-ext";
// import { ArgumentException } from "@nivinjoseph/n-exception";


export const observedEventSymbol = Symbol.for("@nivinjoseph/n-eda/observedEvent");

// public
export function observedEvent(eventType: Function): Function
{
    given(eventType, "eventType").ensureHasValue().ensureIsFunction();

    return (target: Function) => Reflect.defineMetadata(observedEventSymbol, eventType, target);
}


export const observableSymbol = Symbol.for("@nivinjoseph/n-eda/observable");

// public
export function observable(type: Function): Function
{
    given(type, "type").ensureHasValue().ensureIsFunction();

    return (target: Function) => Reflect.defineMetadata(observableSymbol, type, target);
}


export const observerSymbol = Symbol.for("@nivinjoseph/n-eda/observer");

// public
export function observer(type: Function): Function
{
    given(type, "type").ensureHasValue().ensureIsFunction();

    return (target: Function) => Reflect.defineMetadata(observerSymbol, type, target);
}