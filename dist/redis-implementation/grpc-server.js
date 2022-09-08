"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrpcServer = void 0;
const tslib_1 = require("tslib");
const Path = require("path");
const Grpc = require("@grpc/grpc-js");
const ProtoLoader = require("@grpc/proto-loader");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_log_1 = require("@nivinjoseph/n-log");
const n_ject_1 = require("@nivinjoseph/n-ject");
const n_util_1 = require("@nivinjoseph/n-util");
const n_config_1 = require("@nivinjoseph/n-config");
const grpc_event_handler_1 = require("./grpc-event-handler");
// const options = {
//     keepCase: true
// };
// const packageDef = ProtoLoader.loadSync(Path.join(__dirname, "grpc-processor.proto"), options);
// const serviceDef = Grpc.loadPackageDefinition(packageDef).grpcprocessor;
// const port = "5000";
// const server = new Grpc.Server();
// server.addService((serviceDef as any).EdaService.service, {
//     process: (call: any, callback: Function) =>
//     {
//         const request = call.request;
//         console.log(request);
//         const response = {};
//         callback(null, response);
//     }
// });
// server.bindAsync(
//     `127.0.0.1:${port}`,
//     Grpc.ServerCredentials.createInsecure(),
//     (error, port) =>
//     {
//         if (error != null)
//         {
//             console.error(error);
//             return;
//         }
//         console.log(`Server running at http://127.0.0.1:${port}`);
//         server.start();
//     }
// );
class GrpcServer {
    constructor(port, host, container, logger) {
        this._startupScriptKey = "$startupScript";
        this._hasStartupScript = false;
        this._shutdownScriptKey = "$shutdownScript";
        this._hasShutdownScript = false;
        this._disposeActions = new Array();
        this._serviceName = "EdaService";
        this._statusMap = {
            "": ServingStatus.NOT_SERVING,
            [this._serviceName]: ServingStatus.NOT_SERVING
        };
        this._isBootstrapped = false;
        this._isShutDown = false;
        (0, n_defensive_1.given)(port, "port").ensureHasValue().ensureIsNumber();
        this._port = port;
        (0, n_defensive_1.given)(host, "host").ensureIsString();
        this._host = host ? host.trim() : "0.0.0.0";
        (0, n_defensive_1.given)(container, "container").ensureHasValue().ensureIsType(n_ject_1.Container);
        this._container = container;
        (0, n_defensive_1.given)(logger, "logger").ensureIsObject();
        this._logger = logger !== null && logger !== void 0 ? logger : new n_log_1.ConsoleLogger();
    }
    registerEventHandler(eventHandler) {
        (0, n_defensive_1.given)(eventHandler, "eventHandler").ensureHasValue().ensureIsInstanceOf(grpc_event_handler_1.GrpcEventHandler);
        (0, n_defensive_1.given)(this, "this").ensure(t => !t._isBootstrapped, "cannot invoke after bootstrap");
        this._eventHandler = eventHandler;
        return this;
    }
    registerStartupScript(applicationScriptClass) {
        (0, n_defensive_1.given)(applicationScriptClass, "applicationScriptClass").ensureHasValue().ensureIsFunction();
        (0, n_defensive_1.given)(this, "this").ensure(t => !t._isBootstrapped, "cannot invoke after bootstrap");
        this._container.registerSingleton(this._startupScriptKey, applicationScriptClass);
        this._hasStartupScript = true;
        return this;
    }
    registerShutdownScript(applicationScriptClass) {
        (0, n_defensive_1.given)(applicationScriptClass, "applicationScriptClass").ensureHasValue().ensureIsFunction();
        (0, n_defensive_1.given)(this, "this").ensure(t => !t._isBootstrapped, "cannot invoke after bootstrap");
        this._container.registerSingleton(this._shutdownScriptKey, applicationScriptClass);
        this._hasShutdownScript = true;
        return this;
    }
    registerDisposeAction(disposeAction) {
        (0, n_defensive_1.given)(disposeAction, "disposeAction").ensureHasValue().ensureIsFunction();
        (0, n_defensive_1.given)(this, "this").ensure(t => !t._isBootstrapped, "cannot invoke after bootstrap");
        this._disposeActions.push(() => {
            return new Promise((resolve) => {
                try {
                    disposeAction()
                        .then(() => resolve())
                        .catch((e) => {
                        console.error(e);
                        resolve();
                    });
                }
                catch (error) {
                    console.error(error);
                    resolve();
                }
            });
        });
        return this;
    }
    bootstrap() {
        (0, n_defensive_1.given)(this, "this")
            .ensure(t => !t._isBootstrapped, "already bootstrapped")
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            .ensure(t => t._eventHandler != null, "No event handler registered");
        this._configureContainer();
        this._configureStartup()
            .then(() => this._configureServer())
            .then(() => {
            const appEnv = n_config_1.ConfigurationManager.getConfig("env");
            const appName = n_config_1.ConfigurationManager.getConfig("package.name");
            const appVersion = n_config_1.ConfigurationManager.getConfig("package.version");
            const appDescription = n_config_1.ConfigurationManager.getConfig("package.description");
            console.log(`ENV: ${appEnv}; NAME: ${appName}; VERSION: ${appVersion}; DESCRIPTION: ${appDescription}.`);
            this._configureShutDown();
            this._isBootstrapped = true;
            console.log("SERVER STARTED.");
        })
            .catch(e => {
            console.error("STARTUP FAILED!!!");
            console.error(e);
            throw e;
        });
    }
    _configureContainer() {
        this.registerDisposeAction(() => this._container.dispose());
    }
    _configureStartup() {
        console.log("SERVER STARTING.");
        if (!this._hasStartupScript)
            return Promise.resolve();
        return this._container.resolve(this._startupScriptKey).run();
    }
    _configureServer() {
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
        const server = new Grpc.Server();
        server.addService(serviceDef[this._serviceName].service, {
            process: (call, callback) => {
                const request = call.request;
                this._eventHandler.process(request)
                    .then((response) => {
                    callback(null, response);
                })
                    .catch(error => {
                    callback(error.message);
                });
            }
        });
        const healthPackageDef = ProtoLoader.loadSync(Path.join(basePath, "grpc-health-check.proto"), options);
        const healthServiceDef = Grpc.loadPackageDefinition(healthPackageDef)["grpc.health.v1"];
        server.addService(healthServiceDef.Health.service, {
            check: (call, callback) => {
                const { service } = call.request;
                const status = this._statusMap[service];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (status == null) {
                    callback({ code: Grpc.status.NOT_FOUND });
                }
                else {
                    callback(null, { status });
                }
            }
        });
        return new Promise((resolve, reject) => {
            server.bindAsync(`${this._host}:${this._port}`, Grpc.ServerCredentials.createInsecure(), (error, _port) => {
                if (error != null) {
                    reject(error);
                    return;
                }
                try {
                    // console.log(`Server running at http://127.0.0.1:${port}`);
                    server.start();
                    this._server = server;
                    this._changeStatus(ServingStatus.SERVING);
                }
                catch (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
    _configureShutDown() {
        // if (ConfigurationManager.getConfig<string>("env") === "dev")
        //     return;
        this.registerDisposeAction(() => {
            console.log("CLEANING UP. PLEASE WAIT...");
            return n_util_1.Delay.seconds(n_config_1.ConfigurationManager.getConfig("env") === "dev" ? 2 : 20);
        });
        const shutDown = (signal) => {
            if (this._isShutDown)
                return;
            this._isShutDown = true;
            this._changeStatus(ServingStatus.NOT_SERVING);
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            this._server.tryShutdown((error) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                console.warn(`SERVER STOPPING (${signal}).`);
                if (this._hasShutdownScript) {
                    console.log("Shutdown script executing.");
                    try {
                        yield this._container.resolve(this._shutdownScriptKey).run();
                        console.log("Shutdown script complete.");
                    }
                    catch (error) {
                        console.warn("Shutdown script error.");
                        console.error(error);
                    }
                }
                console.log("Dispose actions executing.");
                try {
                    yield Promise.all(this._disposeActions.map(t => t()));
                    console.log("Dispose actions complete.");
                }
                catch (error) {
                    console.warn("Dispose actions error.");
                    console.error(error);
                }
                if (error) {
                    console.warn("Error while trying to shutdown server");
                    console.error(error);
                    try {
                        this._server.forceShutdown();
                    }
                    catch (error) {
                        console.warn("Error while forcing server shutdown");
                        console.error(error);
                    }
                }
                console.warn(`SERVER STOPPED (${signal}).`);
                process.exit(0);
            }));
        };
        process.on("SIGTERM", () => shutDown("SIGTERM"));
        process.on("SIGINT", () => shutDown("SIGINT"));
    }
    _changeStatus(status) {
        (0, n_defensive_1.given)(status, "status").ensureHasValue().ensureIsEnum(ServingStatus);
        this._statusMap[""] = this._statusMap[this._serviceName] = status;
    }
}
exports.GrpcServer = GrpcServer;
var ServingStatus;
(function (ServingStatus) {
    ServingStatus["UNKNOWN"] = "UNKNOWN";
    ServingStatus["SERVING"] = "SERVING";
    ServingStatus["NOT_SERVING"] = "NOT_SERVING";
    ServingStatus["SERVICE_UNKNOWN"] = "SERVICE_UNKNOWN"; // Used only by the Watch method.
})(ServingStatus || (ServingStatus = {}));
//# sourceMappingURL=grpc-server.js.map