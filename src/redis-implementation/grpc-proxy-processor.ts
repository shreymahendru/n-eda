import { given } from "@nivinjoseph/n-defensive";
import { ApplicationException, Exception } from "@nivinjoseph/n-exception";
import { EdaManager } from "../eda-manager";
import { Processor } from "./processor";
import { WorkItem } from "./scheduler";
import { GrpcClient, GrpcClientFactory } from "./grpc-client-factory";


export class GrpcProxyProcessor extends Processor
{
    private readonly _grpcClient: GrpcClient;


    public constructor(manager: EdaManager, grpcClientFactory: GrpcClientFactory)
    {
        super(manager);

        given(manager, "manager").ensure(t => t.grpcProxyEnabled, "GRPC proxy not enabled");
        
        given(grpcClientFactory, "grpcClientFactory").ensureHasValue().ensureIsType(GrpcClientFactory);
        this._grpcClient = grpcClientFactory.create();
    }


    protected async processEvent(workItem: WorkItem, numAttempt: number): Promise<void>
    {
        given(workItem, "workItem").ensureHasValue().ensureIsObject();
        given(numAttempt, "numAttempt").ensureHasValue().ensureIsNumber();

        try 
        {
            const response = await this._grpcClient.process(workItem);
            
            const { eventName, eventId } = response;

            if (eventName !== workItem.eventName || eventId !== workItem.eventId)
                throw new ApplicationException(
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    `Error during invocation of GRPC. Details => ${response ? JSON.stringify(response) : "Check logs for details."}`);
        }
        catch (error)
        {
            await this.logger.logWarning(`Error in EventHandler while handling event of type '${workItem.eventName}' (ATTEMPT = ${numAttempt}) with data ${JSON.stringify(workItem.event.serialize())}.`);
            await this.logger.logWarning(error as Exception);
            throw error;
        }
    }
}

