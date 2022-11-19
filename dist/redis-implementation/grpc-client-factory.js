"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrpcClientFactory = void 0;
const tslib_1 = require("tslib");
const eda_manager_1 = require("../eda-manager");
const Path = require("path");
const Grpc = require("@grpc/grpc-js");
const ProtoLoader = require("@grpc/proto-loader");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_util_1 = require("@nivinjoseph/n-util");
const n_exception_1 = require("@nivinjoseph/n-exception");
class GrpcClientFactory {
    constructor(manager) {
        this._clients = new Array();
        this._disposableClients = new Array();
        this._roundRobin = 0;
        (0, n_defensive_1.given)(manager, "manager").ensureHasValue().ensureIsInstanceOf(eda_manager_1.EdaManager)
            .ensure(t => t.grpcProxyEnabled, "GRPC proxy not enabled");
        this._manager = manager;
        this._logger = this._manager.serviceLocator.resolve("Logger");
        this._endpoint = `${this._manager.grpcDetails.host}:${this._manager.grpcDetails.port}`;
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
        this._serviceDef = Grpc.loadPackageDefinition(packageDef).grpcprocessor;
        let isSecure = this._manager.grpcDetails.host !== "localhost";
        if (this._manager.grpcDetails.isSecure != null)
            isSecure = this._manager.grpcDetails.isSecure;
        if (isSecure) {
            const creds = Grpc.credentials.createSsl();
            const origConnectionOptions = creds._getConnectionOptions.bind(creds);
            creds._getConnectionOptions = function () {
                const connOptions = origConnectionOptions();
                connOptions.rejectUnauthorized = false;
                return connOptions;
            };
            this._creds = creds;
            console.log("SECURE GRPC CREDENTIALS CREATED");
        }
        else {
            this._creds = Grpc.credentials.createInsecure();
            console.log("INSECURE GRPC CREDENTIALS CREATED");
        }
        n_util_1.Make.loop(() => this._clients.push(new GrpcClientFacade(new GrpcClientInternal(this._endpoint, this._serviceDef, this._creds, this._logger))), 10);
        setInterval(() => {
            this._clients.forEach(client => {
                if (client.internal.isOverused || client.internal.isStale) {
                    const disposable = client.internal;
                    client.swap(new GrpcClientInternal(this._endpoint, this._serviceDef, this._creds, this._logger));
                    this._disposableClients.push(disposable);
                }
            });
        }, n_util_1.Duration.fromMinutes(7).toMilliSeconds()).unref();
        setInterval(() => {
            this._disposableClients.forEach(client => {
                if (!client.isActive)
                    client.dispose().catch(e => console.error(e));
            });
            this._disposableClients.where(t => t.isDisposed).forEach(t => this._disposableClients.remove(t));
        }, n_util_1.Duration.fromMinutes(13).toMilliSeconds()).unref();
    }
    create() {
        if (this._roundRobin >= this._clients.length)
            this._roundRobin = 0;
        const client = this._clients[this._roundRobin];
        this._roundRobin++;
        return client;
    }
}
exports.GrpcClientFactory = GrpcClientFactory;
class GrpcClientInternal {
    constructor(endpoint, serviceDef, creds, logger) {
        this._id = n_util_1.Uuid.create();
        this._createdAt = Date.now();
        this._numInvocations = 0;
        this._activeInvocations = 0;
        this._isDisposing = false;
        this._isDisposed = false;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        this._client = new serviceDef.EdaService(endpoint, creds);
        this._logger = logger;
    }
    get id() { return this._id; }
    get isStale() { return (this._createdAt + n_util_1.Duration.fromMinutes(10).toMilliSeconds()) < Date.now(); }
    get isOverused() { return this._numInvocations > 1000; }
    get isActive() { return this._activeInvocations > 0; }
    get isDisposed() { return this._isDisposed; }
    process(workItem) {
        if (this._isDisposing)
            throw new n_exception_1.ApplicationException("Using disposed client");
        return new Promise((resolve, reject) => {
            this._numInvocations++;
            this._activeInvocations++;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            this._client.process({
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
                this._activeInvocations--;
                if (err)
                    reject(err);
                else
                    resolve(response);
            });
        });
    }
    dispose() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this._isDisposing || this._isDisposed)
                return;
            try {
                this._isDisposing = true;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                this._client.close();
            }
            catch (error) {
                yield this._logger.logWarning("Error while closing GRPC client");
                yield this._logger.logError(error);
            }
            finally {
                this._isDisposed = true;
            }
        });
    }
}
class GrpcClientFacade {
    constructor(clientInternal) {
        this._clientInternal = clientInternal;
    }
    get internal() { return this._clientInternal; }
    process(workItem) {
        return this._clientInternal.process(workItem);
    }
    swap(clientInternal) {
        this._clientInternal = clientInternal;
    }
}
//# sourceMappingURL=grpc-client-factory.js.map