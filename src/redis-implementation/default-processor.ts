import { given } from "@nivinjoseph/n-defensive";
import { ServiceLocator } from "@nivinjoseph/n-ject";
import { EdaEvent } from "../eda-event";
import { EdaEventHandler } from "../eda-event-handler";
import { EdaManager } from "../eda-manager";
import { ObserverEdaEventHandler } from "../observer-eda-event-handler";
import { NedaDistributedObserverNotifyEvent } from "./neda-distributed-observer-notify-event";
import { Processor } from "./processor";
import { WorkItem } from "./scheduler";


export class DefaultProcessor extends Processor
{
    private readonly _onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void;
    
    
    public constructor(manager: EdaManager, onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void)
    {
        super(manager);
        
        given(onEventReceived, "onEventReceived").ensureHasValue().ensureIsFunction();
        this._onEventReceived = onEventReceived;
    }
    
    
    protected async processEvent(workItem: WorkItem): Promise<void>
    {
        const isObservedEvent = workItem.eventRegistration.isObservedEvent;
        let event = workItem.event;
        if (isObservedEvent)
            event = (event as NedaDistributedObserverNotifyEvent).observedEvent;
        
        const scope = this.manager.serviceLocator.createScope();
        (<any>event).$scope = scope;   

        this._onEventReceived(scope, workItem.topic, event);

        const handler = scope.resolve<EdaEventHandler<EdaEvent> | ObserverEdaEventHandler<EdaEvent>>(workItem.eventRegistration.eventHandlerTypeName);

        try 
        {
            await handler.handle(event, (workItem.event as NedaDistributedObserverNotifyEvent).observerId);

            // await this._logger.logInfo(`Executed EventHandler '${workItem.eventRegistration.eventHandlerTypeName}' for event '${workItem.eventName}' with id '${workItem.eventId}' => ConsumerGroupId: ${this._manager.consumerGroupId}; Topic: ${workItem.topic}; Partition: ${workItem.partition};`);
        }
        finally
        {
            await scope.dispose();
        }
    }
}