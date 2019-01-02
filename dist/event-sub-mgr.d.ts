import { Container } from "@nivinjoseph/n-ject";
import { EventMap } from "./event-map";
import { EventBus } from "./event-bus";
export interface EventSubMgr {
    initialize(container: Container, eventMap: EventMap, eventBus: EventBus): void;
    dispose(): Promise<void>;
}
