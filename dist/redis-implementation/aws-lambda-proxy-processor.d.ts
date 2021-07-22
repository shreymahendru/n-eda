import { EdaManager } from "../eda-manager";
import { Processor } from "./processor";
import { WorkItem } from "./scheduler";
export declare class AwsLambdaProxyProcessor extends Processor {
    private readonly _lambda;
    constructor(manager: EdaManager);
    protected processEvent(workItem: WorkItem, numAttempt: number): Promise<void>;
    private _invokeLambda;
}
