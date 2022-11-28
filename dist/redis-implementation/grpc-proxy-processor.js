"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrpcProxyProcessor = void 0;
const tslib_1 = require("tslib");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
const processor_1 = require("./processor");
const grpc_client_factory_1 = require("./grpc-client-factory");
class GrpcProxyProcessor extends processor_1.Processor {
    constructor(manager, grpcClientFactory) {
        super(manager);
        (0, n_defensive_1.given)(manager, "manager").ensure(t => t.grpcProxyEnabled, "GRPC proxy not enabled");
        (0, n_defensive_1.given)(grpcClientFactory, "grpcClientFactory").ensureHasValue().ensureIsType(grpc_client_factory_1.GrpcClientFactory);
        this._grpcClient = grpcClientFactory.create();
    }
    processEvent(workItem) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const response = yield this._grpcClient.process(workItem);
            const { eventName, eventId } = response;
            if (eventName !== workItem.eventName || eventId !== workItem.eventId)
                throw new n_exception_1.ApplicationException(
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                `Error during invocation of GRPC. Details => ${response ? JSON.stringify(response) : "Check logs for details."}`);
        });
    }
}
exports.GrpcProxyProcessor = GrpcProxyProcessor;
//# sourceMappingURL=grpc-proxy-processor.js.map