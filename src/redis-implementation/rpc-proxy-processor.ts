import { given } from "@nivinjoseph/n-defensive";
import { EdaManager } from "../eda-manager";
import { Processor } from "./processor";
import { WorkItem } from "./scheduler";
import { ApplicationException } from "@nivinjoseph/n-exception";
import * as Axios from "axios";


export class RpcProxyProcessor extends Processor
{
    private readonly _rpcClient: Axios.AxiosInstance;


    public constructor(manager: EdaManager)
    {
        super(manager);

        given(manager, "manager").ensure(t => t.rpcProxyEnabled, "RPC proxy not enabled");

        this._rpcClient = Axios.default.create({
            timeout: 60000,
            baseURL: manager.rpcDetails!.host
        });
    }


    protected async processEvent(workItem: WorkItem, numAttempt: number): Promise<void>
    {
        given(workItem, "workItem").ensureHasValue().ensureIsObject();
        given(numAttempt, "numAttempt").ensureHasValue().ensureIsNumber();

        try 
        {
            const response = await this._invokeRPC(workItem);

            if (response.status !== 200)
                throw new ApplicationException(
                    `Error during invocation of RPC. Details => ${response.data ? JSON.stringify(response.data) : "Check logs for details."}`);

            const result = response.data;
            
            if (result.eventName !== workItem.eventName || result.eventId !== workItem.eventId)
                throw new ApplicationException(
                    `Error during invocation of RPC. Details => ${result ? JSON.stringify(result) : "Check logs for details."}`);
        }
        catch (error)
        {
            await this.logger.logWarning(`Error in EventHandler while handling event of type '${workItem.eventName}' (ATTEMPT = ${numAttempt}) with data ${JSON.stringify(workItem.event.serialize())}.`);
            await this.logger.logWarning(error);
            throw error;
        }
    }

    private _invokeRPC(workItem: WorkItem): Promise<Axios.AxiosResponse<any>>
    {
        return this._rpcClient.post(this.manager.rpcDetails!.endpoint + `?event=${workItem.eventName}`, {
            consumerId: workItem.consumerId,
            topic: workItem.topic,
            partition: workItem.partition,
            eventName: workItem.eventName,
            payload: workItem.event.serialize()
        });
    }
}

