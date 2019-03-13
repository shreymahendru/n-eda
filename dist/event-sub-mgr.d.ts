import { Container } from "@nivinjoseph/n-ject";
import { EventMap } from "./event-map";
import { Disposable } from "@nivinjoseph/n-util";
export interface EventSubMgr extends Disposable {
    initialize(container: Container, eventMap: EventMap): void;
}
