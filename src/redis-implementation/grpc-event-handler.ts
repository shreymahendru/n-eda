import { given } from "@nivinjoseph/n-defensive";
import { Exception } from "@nivinjoseph/n-exception";
import { ServiceLocator } from "@nivinjoseph/n-ject";
import { Logger } from "@nivinjoseph/n-log";
import { Deserializer } from "@nivinjoseph/n-util";
import { EdaEvent } from "../eda-event";
import { EdaEventHandler } from "../eda-event-handler";
import { EdaManager } from "../eda-manager";
import { EventRegistration } from "../event-registration";
import { GrpcModel } from "../grpc-details";


export class GrpcEventHandler
{
    private _manager: EdaManager | null = null;
    private _logger: Logger | null = null;


    public initialize(manager: EdaManager): void
    {
        given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(EdaManager)
            .ensure(t => t.isGrpcConsumer, "GRPC consumer not enabled");
        this._manager = manager;

        this._logger = this._manager.serviceLocator.resolve<Logger>("Logger");
    }


    public async process(model: GrpcModel): Promise<{ eventName: string; eventId: string; }>
    {
        try 
        {
            given(model, "model").ensureHasValue().ensureIsObject();

            given(this, "this").ensure(t => t._manager != null, "not initialized");

            const eventData: EventInfo = {
                consumerId: model.consumerId,
                topic: model.topic,
                partition: model.partition,
                eventName: model.eventName,
                event: Deserializer.deserialize<EdaEvent>(JSON.parse(model.payload))
            };
            
            await this._process(eventData);
            
            return {
                eventName: eventData.eventName,
                eventId: eventData.event.id
            };
        }
        catch (error)
        {
            await this._logger!.logError(error as any);
            
            throw new Error(this._getErrorMessage(error));
        }
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
            await this._logger!.logWarning(`Error in GRPC event handler while handling event of type '${data.eventName}' with data ${JSON.stringify(data.event.serialize())}.`);
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
            logMessage = "There was an error while attempting to log another message in GRPC event handler.";
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