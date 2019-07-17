import { EventSubMgr } from "../event-sub-mgr";
import { Container, Scope } from "@nivinjoseph/n-ject";
import { EdaEvent } from "../eda-event";
import { Logger } from "@nivinjoseph/n-log";
import { EventRegistration } from "../event-registration";
export declare class InMemoryEventSubMgr implements EventSubMgr {
    private readonly _logger;
    private readonly _processor;
    private _isDisposed;
    private _isInitialized;
    constructor(logger: Logger);
    initialize(container: Container, eventMap: ReadonlyMap<string, EventRegistration>): void;
    dispose(): Promise<void>;
    protected onEventReceived(scope: Scope, event: EdaEvent): void;
}
