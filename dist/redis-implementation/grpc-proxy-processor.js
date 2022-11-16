"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrpcProxyProcessor = void 0;
const tslib_1 = require("tslib");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
const processor_1 = require("./processor");
const Path = require("path");
const Grpc = require("@grpc/grpc-js");
const ProtoLoader = require("@grpc/proto-loader");
class GrpcProxyProcessor extends processor_1.Processor {
    constructor(manager) {
        super(manager);
        (0, n_defensive_1.given)(manager, "manager").ensure(t => t.grpcProxyEnabled, "GRPC proxy not enabled");
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
        // const isSecure = manager.grpcDetails!.host.startsWith("https:");
        let isSecure = manager.grpcDetails.host !== "localhost";
        if (manager.grpcDetails.isSecure != null)
            isSecure = manager.grpcDetails.isSecure;
        if (isSecure) {
            // const grpcCertDomain = ConfigurationManager.getConfig<string>("grpcCertDomain");
            // given(grpcCertDomain, "grpcCertDomain").ensureHasValue().ensureIsString();
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
            const creds = Grpc.credentials.createSsl();
            const origConnectionOptions = creds._getConnectionOptions.bind(creds);
            creds._getConnectionOptions = function () {
                const connOptions = origConnectionOptions();
                connOptions.rejectUnauthorized = false;
                return connOptions;
            };
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            this._grpcClient = new serviceDef.EdaService(`${manager.grpcDetails.host}:${manager.grpcDetails.port}`, creds);
            console.log("SECURE GRPC CLIENT CREATED");
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            this._grpcClient = new serviceDef.EdaService(`${manager.grpcDetails.host}:${manager.grpcDetails.port}`, Grpc.credentials.createInsecure());
            console.log("INSECURE GRPC CLIENT CREATED");
        }
    }
    processEvent(workItem, numAttempt) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            (0, n_defensive_1.given)(workItem, "workItem").ensureHasValue().ensureIsObject();
            (0, n_defensive_1.given)(numAttempt, "numAttempt").ensureHasValue().ensureIsNumber();
            try {
                const response = yield this._invokeGRPC(workItem);
                const { eventName, eventId } = response;
                if (eventName !== workItem.eventName || eventId !== workItem.eventId)
                    throw new n_exception_1.ApplicationException(`Error during invocation of GRPC. Details => ${response ? JSON.stringify(response) : "Check logs for details."}`);
            }
            catch (error) {
                yield this.logger.logWarning(`Error in EventHandler while handling event of type '${workItem.eventName}' (ATTEMPT = ${numAttempt}) with data ${JSON.stringify(workItem.event.serialize())}.`);
                yield this.logger.logWarning(error);
                throw error;
            }
        });
    }
    _invokeGRPC(workItem) {
        return new Promise((resolve, reject) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            this._grpcClient.process({
                consumerId: workItem.consumerId,
                topic: workItem.topic,
                partition: workItem.partition,
                eventName: workItem.eventName,
                payload: JSON.stringify(workItem.event.serialize())
            }, 
            // {
            //     deadline: Date.now() + Duration.fromSeconds(120).toMilliSeconds()
            // },
            (err, response) => {
                if (err)
                    reject(err);
                else
                    resolve(response);
            });
        });
    }
}
exports.GrpcProxyProcessor = GrpcProxyProcessor;
//# sourceMappingURL=grpc-proxy-processor.js.map