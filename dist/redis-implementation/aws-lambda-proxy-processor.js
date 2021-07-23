"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsLambdaProxyProcessor = void 0;
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const processor_1 = require("./processor");
const aws_sdk_1 = require("aws-sdk");
const n_exception_1 = require("@nivinjoseph/n-exception");
const n_config_1 = require("@nivinjoseph/n-config");
class AwsLambdaProxyProcessor extends processor_1.Processor {
    constructor(manager) {
        super(manager);
        n_defensive_1.given(manager, "manager").ensure(t => t.awsLambdaProxyEnabled, "AWS Lambda proxy not enabled");
        const awsLambdaAccessKeyId = n_config_1.ConfigurationManager.getConfig("awsLambdaAccessKeyId");
        n_defensive_1.given(awsLambdaAccessKeyId, "awsLambdaAccessKeyId").ensureHasValue().ensureIsString();
        const awsLambdaSecretAccessKey = n_config_1.ConfigurationManager.getConfig("awsLambdaSecretAccessKey");
        n_defensive_1.given(awsLambdaSecretAccessKey, "awsLambdaSecretAccessKey").ensureHasValue().ensureIsString();
        this._lambda = new aws_sdk_1.Lambda({
            signatureVersion: "v4",
            region: "us-east-1",
            credentials: {
                accessKeyId: awsLambdaAccessKeyId,
                secretAccessKey: awsLambdaSecretAccessKey
            }
        });
    }
    processEvent(workItem, numAttempt) {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function* () {
            n_defensive_1.given(workItem, "workItem").ensureHasValue().ensureIsObject();
            n_defensive_1.given(numAttempt, "numAttempt").ensureHasValue().ensureIsNumber();
            try {
                const response = yield this._invokeLambda(workItem);
                const result = response.Payload ? JSON.parse(response.Payload) : null;
                if (result != null && result.error)
                    throw new n_exception_1.ApplicationException("Error during invocation of AWS Lambda.", result.error);
                if (response.StatusCode !== 200)
                    throw new n_exception_1.ApplicationException(`Error during invocation of AWS Lambda. Details => ${(_b = (_a = response.LogResult) === null || _a === void 0 ? void 0 : _a.base64Decode()) !== null && _b !== void 0 ? _b : "Check CloudWatch logs for details."}`);
                if (result.eventName !== workItem.eventName || result.eventId !== workItem.eventId)
                    throw new n_exception_1.ApplicationException(`Error during invocation of AWS Lambda. Details => ${(_d = (_c = response.LogResult) === null || _c === void 0 ? void 0 : _c.base64Decode()) !== null && _d !== void 0 ? _d : "Check CloudWatch logs for details."}`);
            }
            catch (error) {
                yield this.logger.logWarning(`Error in EventHandler while handling event of type '${workItem.eventName}' (ATTEMPT = ${numAttempt}) with data ${JSON.stringify(workItem.event.serialize())}.`);
                yield this.logger.logWarning(error);
                throw error;
            }
        });
    }
    _invokeLambda(workItem) {
        return new Promise((resolve, reject) => {
            this._lambda.invoke({
                FunctionName: this.manager.awsLambdaFuncName,
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