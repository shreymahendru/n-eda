import "reflect-metadata";
import "@nivinjoseph/n-ext";
export declare const observedEventSymbol: unique symbol;
export declare function observedEvent(eventType: Function): Function;
export declare const observableSymbol: unique symbol;
export declare function observable(type: Function): Function;
export declare const observerSymbol: unique symbol;
export declare function observer(type: Function): Function;
