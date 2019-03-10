import { Container } from "@nivinjoseph/n-ject";
import { EventMap } from "./event-map";
import { EventBus } from "./event-bus";
import { Disposable } from "@nivinjoseph/n-util";
export interface EventSubMgr extends Disposable {
    initialize(container: Container, eventMap: EventMap, eventBus: EventBus): void;
}
