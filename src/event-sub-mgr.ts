import { Container } from "@nivinjoseph/n-ject";
import { Disposable } from "@nivinjoseph/n-util";
import { EventRegistration } from "./event-registration";

// public
export interface EventSubMgr extends Disposable
{
    initialize(container: Container, eventMap: ReadonlyMap<string, EventRegistration>): void;
}