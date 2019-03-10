import { EventSubMgr } from "../event-sub-mgr";
import { Container } from "@nivinjoseph/n-ject";
import { EventMap } from "../event-map";
import { EventBus } from "../event-bus";
import { Logger } from "@nivinjoseph/n-log";
export declare class InMemoryEventSubMgr implements EventSubMgr {
    private readonly _logger;
    private readonly _processor;
    private _isDisposed;
    constructor(logger: Logger);
    initialize(container: Container, eventMap: EventMap, eventBus: EventBus): void;
    dispose(): Promise<void>;
}
