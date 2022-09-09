import { given } from "@nivinjoseph/n-defensive";
import { ApplicationException, Exception } from "@nivinjoseph/n-exception";
import { EdaManager } from "../eda-manager";
import { Processor } from "./processor";
import { WorkItem } from "./scheduler";
import * as Path from "path";
import * as Grpc from "@grpc/grpc-js";
import * as ProtoLoader from "@grpc/proto-loader";


export class GrpcProxyProcessor extends Processor
{
    private readonly _grpcClient: any;


    public constructor(manager: EdaManager)
    {
        super(manager);

        given(manager, "manager").ensure(t => t.grpcProxyEnabled, "GRPC proxy not enabled");
        
        const options = {
            keepCase: false,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        };
        
        const basePath = __dirname.endsWith(`dist${Path.sep}redis-implementation`)
            ? Path.resolve(__dirname, "..", "..", "src", "redis-implementation")
            : __dirname;

        const packageDef = ProtoLoader.loadSync(Path.join(basePath, "grpc-processor.proto"), options);
        const serviceDef = Grpc.loadPackageDefinition(packageDef).grpcprocessor;
        
        const isSecure = manager.grpcDetails!.host.startsWith("dns:");
        
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        this._grpcClient = new (serviceDef as any).EdaService(
            `${manager.grpcDetails!.host}:${manager.grpcDetails!.port}`,
            isSecure ? Grpc.credentials.createSsl() : Grpc.credentials.createInsecure(), 
            isSecure ? { 'grpc.ssl_target_name_override': 'stage.api.internal' } : undefined
        );
    }


    protected async processEvent(workItem: WorkItem, numAttempt: number): Promise<void>
    {
        given(workItem, "workItem").ensureHasValue().ensureIsObject();
        given(numAttempt, "numAttempt").ensureHasValue().ensureIsNumber();

        try 
        {
            const response = await this._invokeGRPC(workItem);
            
            const { eventName, eventId } = response;

            if (eventName !== workItem.eventName || eventId !== workItem.eventId)
                throw new ApplicationException(
                    `Error during invocation of GRPC. Details => ${response ? JSON.stringify(response) : "Check logs for details."}`);
        }
        catch (error)
        {
            await this.logger.logWarning(`Error in EventHandler while handling event of type '${workItem.eventName}' (ATTEMPT = ${numAttempt}) with data ${JSON.stringify(workItem.event.serialize())}.`);
            await this.logger.logWarning(error as Exception);
            throw error;
        }
    }

    private _invokeGRPC(workItem: WorkItem): Promise<any>
    {
        return new Promise((resolve, reject) =>
        {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            this._grpcClient.process({
                consumerId: workItem.consumerId,
                topic: workItem.topic,
                partition: workItem.partition,
                eventName: workItem.eventName,
                payload: JSON.stringify(workItem.event.serialize())
            }, (err: any, response: any) =>
            {
                if (err)
                    reject(err);
                else
                    resolve(response);
            });
        });
    }
}

