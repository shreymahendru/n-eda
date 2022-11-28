"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsLambdaProxyProcessor = void 0;
const tslib_1 = require("tslib");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const processor_1 = require("./processor");
const aws_sdk_1 = require("aws-sdk");
const n_exception_1 = require("@nivinjoseph/n-exception");
class AwsLambdaProxyProcessor extends processor_1.Processor {
    constructor(manager) {
        super(manager);
        (0, n_defensive_1.given)(manager, "manager").ensure(t => t.awsLambdaProxyEnabled, "AWS Lambda proxy not enabled");
        this._lambda = new aws_sdk_1.Lambda({
            signatureVersion: "v4",
            region: manager.awsLambdaDetails.region,
            credentials: {
                accessKeyId: manager.awsLambdaDetails.credentials.accessKeyId,
                secretAccessKey: manager.awsLambdaDetails.credentials.accessKeySecret
            }
        });
    }
    processEvent(workItem) {
        var _a, _b, _c, _d;
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const response = yield this._invokeLambda(workItem);
            const result = response.Payload ? JSON.parse(response.Payload) : null;
            if (result != null && result.error)
                throw new n_exception_1.ApplicationException("Error during invocation of AWS Lambda.", result.error);
            if (response.StatusCode !== 200)
                throw new n_exception_1.ApplicationException(`Error during invocation of AWS Lambda. Details => ${(_b = (_a = response.LogResult) === null || _a === void 0 ? void 0 : _a.base64Decode()) !== null && _b !== void 0 ? _b : "Check CloudWatch logs for details."}`);
            if (result.eventName !== workItem.eventName || result.eventId !== workItem.eventId)
                throw new n_exception_1.ApplicationException(`Error during invocation of AWS Lambda. Details => ${(_d = (_c = response.LogResult) === null || _c === void 0 ? void 0 : _c.base64Decode()) !== null && _d !== void 0 ? _d : "Check CloudWatch logs for details."}`);
        });
    }
    _invokeLambda(workItem) {
        return new Promise((resolve, reject) => {
            this._lambda.invoke({
                FunctionName: this.manager.awsLambdaDetails.funcName,
                InvocationType: "RequestResponse",
                LogType: "Tail",
                ClientContext: JSON.stringify({
                    consumerId: workItem.consumerId,
                    topic: workItem.topic,
                    partition: workItem.partition,
                    eventName: workItem.eventName
                }).base64Encode(),
                Payload: JSON.stringify(workItem.event.serialize())
            }, (err, data) => {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (err) {
                    reject(err);
                    return;
                }
                resolve(data);
            });
        });
    }
}
exports.AwsLambdaProxyProcessor = AwsLambdaProxyProcessor;
//# sourceMappingURL=aws-lambda-proxy-processor.js.map