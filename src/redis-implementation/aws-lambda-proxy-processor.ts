import { given } from "@nivinjoseph/n-defensive";
import { EdaManager } from "../eda-manager";
import { Processor } from "./processor";
import { WorkItem } from "./scheduler";
import { Lambda } from "aws-sdk";
import { ApplicationException } from "@nivinjoseph/n-exception";
import { ConfigurationManager } from "@nivinjoseph/n-config";


export class AwsLambdaProxyProcessor extends Processor
{
    private readonly _lambda: Lambda;


    public constructor(manager: EdaManager)
    {
        super(manager);
        
        given(manager, "manager").ensure(t => t.awsLambdaProxyEnabled, "AWS Lambda proxy not enabled");
        
        const awsLambdaAccessKeyId = ConfigurationManager.getConfig<string>("awsLambdaAccessKeyId");
        given(awsLambdaAccessKeyId, "awsLambdaAccessKeyId").ensureHasValue().ensureIsString();
        
        const awsLambdaSecretAccessKey = ConfigurationManager.getConfig<string>("awsLambdaSecretAccessKey");
        given(awsLambdaSecretAccessKey, "awsLambdaSecretAccessKey").ensureHasValue().ensureIsString();
        
        this._lambda = new Lambda({
            signatureVersion: "v4",
            region: "us-east-1",
            credentials: {
                accessKeyId: awsLambdaAccessKeyId,
                secretAccessKey: awsLambdaSecretAccessKey
            }
        });
    }


    protected async processEvent(workItem: WorkItem, numAttempt: number): Promise<void>
    {
        given(workItem, "workItem").ensureHasValue().ensureIsObject();
        given(numAttempt, "numAttempt").ensureHasValue().ensureIsNumber();
        
        try 
        {
            const response = await this._invokeLambda(workItem);
            if (response.StatusCode !== 200)
                throw new ApplicationException(
                    `Error during invocation of AWS Lambda. Details => ${response.LogResult?.base64Decode() ?? "NONE"}`);
            
            const awsLambdaInvocationResult = JSON.parse(response.Payload as string);
            given(awsLambdaInvocationResult, "awsLambdaInvocationResult")
                .ensure(t => t.eventName === workItem.eventName, "eventName mismatch")
                .ensure(t => t.eventId === workItem.eventId, "eventId mismatch");
        }
        catch (error)
        {
            await this.logger.logWarning(`Error in EventHandler while handling event of type '${workItem.eventName}' (ATTEMPT = ${numAttempt}) with data ${JSON.stringify(workItem.event.serialize())}.`);
            await this.logger.logWarning(error);
            throw error;
        }
    }
    
    private _invokeLambda(workItem: WorkItem): Promise<Lambda.InvocationResponse>
    {
        return new Promise<Lambda.InvocationResponse>((resolve, reject) =>
        {
            this._lambda.invoke({
                FunctionName: this.manager.awsLambdaFuncName!,
                InvocationType: "RequestResponse",
                LogType: "Tail",
                ClientContext: JSON.stringify({
                    consumerId: workItem.consumerId,
                    topic: workItem.topic,
                    partition: workItem.partition,
                    eventName: workItem.eventName
                }).base64Encode(),
                Payload: JSON.stringify(workItem.event.serialize())
            }, (err, data) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }
                
                resolve(data);
            });
        });
    }
}