"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcProxyProcessor = void 0;
const tslib_1 = require("tslib");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const processor_1 = require("./processor");
const n_exception_1 = require("@nivinjoseph/n-exception");
const Axios = require("axios");
class RpcProxyProcessor extends processor_1.Processor {
    constructor(manager) {
        super(manager);
        (0, n_defensive_1.given)(manager, "manager").ensure(t => t.rpcProxyEnabled, "RPC proxy not enabled");
        this._rpcClient = Axios.default.create({
            timeout: 60000,
            baseURL: manager.rpcDetails.host
        });
    }
    processEvent(workItem, numAttempt) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            (0, n_defensive_1.given)(workItem, "workItem").ensureHasValue().ensureIsObject();
            (0, n_defensive_1.given)(numAttempt, "numAttempt").ensureHasValue().ensureIsNumber();
            try {
                const response = yield this._invokeRPC(workItem);
                if (response.status !== 200)
                    throw new n_exception_1.ApplicationException(`Error during invocation of RPC. Details => ${response.data ? JSON.stringify(response.data) : "Check logs for details."}`);
                const result = response.data;
                if (result.eventName !== workItem.eventName || result.eventId !== workItem.eventId)
                    throw new n_exception_1.ApplicationException(`Error during invocation of RPC. Details => ${result ? JSON.stringify(result) : "Check logs for details."}`);
            }
            catch (error) {
                yield this.logger.logWarning(`Error in EventHandler while handling event of type '${workItem.eventName}' (ATTEMPT = ${numAttempt}) with data ${JSON.stringify(workItem.event.serialize())}.`);
                yield this.logger.logWarning(error);
                throw error;
            }
        });
    }
    _invokeRPC(workItem) {
        return this._rpcClient.post(this.manager.rpcDetails.endpoint + `?event=${workItem.eventName}`, {
            consumerId: workItem.consumerId,
            topic: workItem.topic,
            partition: workItem.partition,
            eventName: workItem.eventName,
            payload: workItem.event.serialize()
        });
    }
}
exports.RpcProxyProcessor = RpcProxyProcessor;
//# sourceMappingURL=rpc-proxy-processor.js.map