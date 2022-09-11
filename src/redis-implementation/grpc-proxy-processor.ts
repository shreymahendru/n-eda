import { given } from "@nivinjoseph/n-defensive";
import { ApplicationException, Exception } from "@nivinjoseph/n-exception";
import { EdaManager } from "../eda-manager";
import { Processor } from "./processor";
import { WorkItem } from "./scheduler";
import * as Path from "path";
// import * as Grpc from "grpc";
import * as Grpc from "@grpc/grpc-js";
import * as ProtoLoader from "@grpc/proto-loader";
import { ConfigurationManager } from "@nivinjoseph/n-config";


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
        
        const isSecure = manager.grpcDetails!.host.startsWith("https:");
        if (isSecure)
        {
            // let grpcCert = ConfigurationManager.getConfig<string>("grpcCert");
            // given(grpcCert, "grpcCert").ensureHasValue().ensureIsString();
            // grpcCert = grpcCert.hexDecode();
            
            const grpcCertDomain = ConfigurationManager.getConfig<string>("grpcCertDomain");
            given(grpcCertDomain, "grpcCertDomain").ensureHasValue().ensureIsString();
            
            // // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            // this._grpcClient = new (serviceDef as any).EdaService(
            //     `${manager.grpcDetails!.host}:${manager.grpcDetails!.port}`,
            //     Grpc.credentials.createSsl(Buffer.from(grpcCert), null, null, {
            //         checkServerIdentity: () => undefined
            //     }),
            //     {
            //         "grpc.ssl_target_name_override": grpcCertDomain,
            //         "grpc.default_authority": grpcCertDomain
            //     }
            // );
            
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            this._grpcClient = new (serviceDef as any).EdaService(
                `${manager.grpcDetails!.host}:${manager.grpcDetails!.port}`,
                Grpc.credentials.createSsl(undefined, undefined, undefined, {
                    checkServerIdentity: (hostname, _cert) =>
                    {
                        console.log(`GRPC Proxy Processor checking hostname ${hostname}`);
                        
                        return undefined;
                    }
                })
                // {
                //     "grpc.ssl_target_name_override": grpcCertDomain,
                //     "grpc.default_authority": grpcCertDomain
                // }
            );
        }
        else
        {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            this._grpcClient = new (serviceDef as any).EdaService(
                `${manager.grpcDetails!.host}:${manager.grpcDetails!.port}`,
                Grpc.credentials.createInsecure()
            );
        }
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

