import { given } from "@nivinjoseph/n-defensive";
import { ServiceLocator } from "@nivinjoseph/n-ject";
import { Logger } from "@nivinjoseph/n-log";
import { Deserializer } from "@nivinjoseph/n-util";
import { EdaEvent } from "../eda-event";
import { EdaEventHandler } from "../eda-event-handler";
import { EdaManager } from "../eda-manager";
import { EventRegistration } from "../event-registration";


export class AwsLambdaEventHandler
{
    private _manager: EdaManager = null as any;
    private _logger: Logger = null as any;
    
    
    public initialize(manager: EdaManager): void
    {
        given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(EdaManager)
            .ensure(t => t.isAwsLambdaConsumer, "AWS Lambda consumer not enabled");
        this._manager = manager;

        this._logger = this._manager.serviceLocator.resolve<Logger>("Logger");
    }
    
    
    public async process(event: any, context: any): Promise<{ eventName: string; eventId: string }>
    {
        given(event, "event").ensureHasValue().ensureIsObject();
        given(context, "context").ensureHasValue().ensureIsObject();
        
        given(this, "this").ensure(t => t._manager != null, "not initialized");
        
        const ctx = context.clientContext;
        
        const eventData: EventInfo = {
            consumerId: ctx.consumerId,
            topic: ctx.topic,
            partition: ctx.partition,
            eventName: ctx.eventName,
            event: Deserializer.deserialize<EdaEvent>(event)
        };
        
        await this._process(eventData);
        
        return {
            eventName: eventData.eventName,
            eventId: eventData.event.id,
        };
    }
    
    private async _process(data: EventInfo): Promise<void>
    {
        given(data, "data").ensureHasValue().ensureIsObject()
            .ensureHasStructure({
                consumerId: "string",
                topic: "string",
                partition: "number",
                eventName: "string",
                event: "object"
            });
        
        const eventRegistration = this._manager.eventMap.get(data.eventName) as EventRegistration;
        
        const scope = this._manager.serviceLocator.createScope();
        (<any>data.event).$scope = scope;

        this.onEventReceived(scope, data.topic, data.event);

        const handler = scope.resolve<EdaEventHandler<EdaEvent>>(eventRegistration.eventHandlerTypeName);

        try 
        {
            await handler.handle(data.event);
        }
        catch (error)
        {
            await this._logger.logWarning(`Error in EventHandler while handling event of type '${data.eventName}' with data ${JSON.stringify(data.event.serialize())}.`);
            await this._logger.logWarning(error);
            throw error;
        }
        finally
        {
            await scope.dispose();
        }
    }
    
    
    protected onEventReceived(scope: ServiceLocator, topic: string, event: EdaEvent): void
    {
        given(scope, "scope").ensureHasValue().ensureIsObject();
        given(topic, "topic").ensureHasValue().ensureIsString();
        given(event, "event").ensureHasValue().ensureIsObject();
    }
}


interface EventInfo
{
    consumerId: string;
    topic: string;
    partition: number;
    eventName: string;
    event: EdaEvent;
}