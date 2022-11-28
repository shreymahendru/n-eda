import { given } from "@nivinjoseph/n-defensive";
import { ServiceLocator } from "@nivinjoseph/n-ject";
import { EdaEvent } from "../eda-event";
import { EdaEventHandler } from "../eda-event-handler";
import { EdaManager } from "../eda-manager";
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
        const scope = this.manager.serviceLocator.createScope();
        (<any>workItem.event).$scope = scope;

        this._onEventReceived(scope, workItem.topic, workItem.event);

        const handler = scope.resolve<EdaEventHandler<EdaEvent>>(workItem.eventRegistration.eventHandlerTypeName);

        try 
        {
            await handler.handle(workItem.event);

            // await this._logger.logInfo(`Executed EventHandler '${workItem.eventRegistration.eventHandlerTypeName}' for event '${workItem.eventName}' with id '${workItem.eventId}' => ConsumerGroupId: ${this._manager.consumerGroupId}; Topic: ${workItem.topic}; Partition: ${workItem.partition};`);
        }
        finally
        {
            await scope.dispose();
        }
    }
}