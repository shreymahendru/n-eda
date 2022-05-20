import { given } from "@nivinjoseph/n-defensive";
import { Exception } from "@nivinjoseph/n-exception";
import { ServiceLocator } from "@nivinjoseph/n-ject";
import { Logger } from "@nivinjoseph/n-log";
import { Deserializer } from "@nivinjoseph/n-util";
import { EdaEvent } from "../eda-event";
import { EdaEventHandler } from "../eda-event-handler";
import { EdaManager } from "../eda-manager";
import { EventRegistration } from "../event-registration";


export class AwsLambdaEventHandler
{
    private _manager: EdaManager | null = null;
    private _logger: Logger | null = null;
    
    
    public initialize(manager: EdaManager): void
    {
        given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(EdaManager)
            .ensure(t => t.isAwsLambdaConsumer, "AWS Lambda consumer not enabled");
        this._manager = manager;

        this._logger = this._manager.serviceLocator.resolve<Logger>("Logger");
    }
    
    
    public async process(event: object, context: Record<string, any>)
        : Promise<{ eventName: string; eventId: string; } | { statusCode: number; error: string; }>
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
        
        try 
        {
            await this._process(eventData);
        }
        catch (error)
        {
            return {
                statusCode: 500,
                error: this._getErrorMessage(error)
            };
        }
        
        return {
            eventName: eventData.eventName,
            eventId: eventData.event.id
        };
    }
    
    protected onEventReceived(scope: ServiceLocator, topic: string, event: EdaEvent): void
    {
        given(scope, "scope").ensureHasValue().ensureIsObject();
        given(topic, "topic").ensureHasValue().ensureIsString();
        given(event, "event").ensureHasValue().ensureIsObject();
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
        
        const eventRegistration = this._manager!.eventMap.get(data.eventName) as EventRegistration;
        
        const scope = this._manager!.serviceLocator.createScope();
        (<any>data.event).$scope = scope;

        this.onEventReceived(scope, data.topic, data.event);

        const handler = scope.resolve<EdaEventHandler<EdaEvent>>(eventRegistration.eventHandlerTypeName);

        try 
        {
            await handler.handle(data.event);
        }
        catch (error)
        {
            await this._logger!.logWarning(`Error in EventHandler while handling event of type '${data.eventName}' with data ${JSON.stringify(data.event.serialize())}.`);
            await this._logger!.logWarning(error as Exception);
            throw error;
        }
        finally
        {
            await scope.dispose();
        }
    }
    
    private _getErrorMessage(exp: Exception | Error | any): string
    {
        let logMessage = "";
        try 
        {
            if (exp instanceof Exception)
                logMessage = exp.toString();
            else if (exp instanceof Error)
                logMessage = exp.stack!;
            else
                logMessage = (<object>exp).toString();
        }
        catch (error)
        {
            console.warn(error);
            logMessage = "There was an error while attempting to log another message.";
        }

        return logMessage;
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