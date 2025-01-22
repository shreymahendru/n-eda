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
const n_svc_1 = require("@nivinjoseph/n-svc");
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
        this._shutdownManager = null;
        (0, n_defensive_1.given)(port, "port").ensureHasValue().ensureIsNumber();
        this._port = port;
        (0, n_defensive_1.given)(host, "host").ensureIsString();
        this._host = host ? host.trim() : "0.0.0.0";
        (0, n_defensive_1.given)(container, "container").ensureHasValue().ensureIsType(n_ject_1.Container);
        this._container = container;
        (0, n_defensive_1.given)(logger, "logger").ensureIsObject();
        this._logger = logger !== null && logger !== void 0 ? logger : new n_log_1.ConsoleLogger({
            useJsonFormat: n_config_1.ConfigurationManager.getConfig("env") !== "dev"
        });
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
                        this._logger.logError(e).finally(() => resolve());
                        // resolve();
                    });
                }
                catch (error) {
                    this._logger.logError(error).finally(() => resolve());
                    // resolve();
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
            .then(() => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const appEnv = n_config_1.ConfigurationManager.getConfig("env");
            const appName = n_config_1.ConfigurationManager.getConfig("package.name");
            const appVersion = n_config_1.ConfigurationManager.getConfig("package.version");
            const appDescription = n_config_1.ConfigurationManager.getConfig("package.description");
            yield this._logger.logInfo(`ENV: ${appEnv}; NAME: ${appName}; VERSION: ${appVersion}; DESCRIPTION: ${appDescription}.`);
            this._configureShutDown();
            this._isBootstrapped = true;
            yield this._logger.logInfo("GRPC SERVER STARTED");
        }))
            .catch((e) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield this._logger.logWarning("GRPC SERVER STARTUP FAILED");
            yield this._logger.logError(e);
            throw e;
        }));
    }
    _configureContainer() {
        this.registerDisposeAction(() => this._container.dispose());
    }
    _configureStartup() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield this._logger.logInfo("GRPC SERVER STARTING...");
            if (this._hasStartupScript)
                yield this._container.resolve(this._startupScriptKey).run();
        });
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
                if (this._shutdownManager == null || this._shutdownManager.isShutdown) {
                    callback({ code: Grpc.status.UNAVAILABLE });
                    return;
                }
                const request = call.request;
                this._eventHandler.process(request)
                    .then((response) => {
                    callback(null, response);
                })
                    .catch(error => {
                    callback(error);
                });
            }
        });
        const healthPackageDef = ProtoLoader.loadSync(Path.join(basePath, "grpc-health-check.proto"), options);
        const healthServiceDef = Grpc.loadPackageDefinition(healthPackageDef).grpchealthv1;
        server.addService(healthServiceDef["Health"].service, {
            check: (_call, callback) => {
                // const service = call.request ?? "";
                // const status = this._statusMap[service];
                // // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                // if (status == null)
                // {
                //     callback({ code: Grpc.status.NOT_FOUND });
                // }
                // else if (status === ServingStatus.SERVING)
                // {
                //     callback({ code: Grpc.status.OK });
                //     // callback(null, { status });
                // }
                // else
                // {
                //     callback({ code: Grpc.status.UNAVAILABLE });
                // }
                const status = this._statusMap[this._serviceName];
                if (status === ServingStatus.SERVING)
                    callback(null, { status });
                else
                    callback({ code: Grpc.status.UNAVAILABLE });
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
        this.registerDisposeAction(() => tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield this._logger.logInfo("CLEANING UP. PLEASE WAIT...");
            // return Delay.seconds(ConfigurationManager.getConfig<string>("env") === "dev" ? 2 : 20);
        }));
        this._shutdownManager = new n_svc_1.ShutdownManager(this._logger, [
            () => tslib_1.__awaiter(this, void 0, void 0, function* () {
                const seconds = n_config_1.ConfigurationManager.getConfig("env") === "dev" ? 2 : 15;
                yield this._logger.logInfo(`BEGINNING WAIT (${seconds}S) FOR CONNECTION DRAIN...`);
                this._changeStatus(ServingStatus.NOT_SERVING);
                yield n_util_1.Delay.seconds(seconds);
                yield this._logger.logInfo("CONNECTION DRAIN COMPLETE");
            }),
            () => {
                return new Promise((resolve, reject) => {
                    this._logger.logInfo("CLOSING GRPC SERVER...").finally(() => {
                        // eslint-disable-next-line @typescript-eslint/no-misused-promises
                        this._server.tryShutdown((err) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                            if (err) {
                                yield this._logger.logWarning("GRPC SERVER CLOSE ERRORED");
                                yield this._logger.logError(err);
                                try {
                                    yield this._logger.logInfo("FORCING GRPC SERVER SHUTDOWN...");
                                    this._server.forceShutdown();
                                    yield this._logger.logInfo("FORCE SHUTDOWN OF GRPC SERVER COMPLETE");
                                }
                                catch (error) {
                                    yield this._logger.logWarning("FORCE SHUTDOWN OF GRPC SERVER ERRORED");
                                    yield this._logger.logError(error);
                                    reject(error);
                                    return;
                                }
                            }
                            yield this._logger.logInfo("GRPC SERVER CLOSED");
                            resolve();
                        }));
                    });
                });
            },
            () => tslib_1.__awaiter(this, void 0, void 0, function* () {
                if (this._hasShutdownScript) {
                    yield this._logger.logInfo("SHUTDOWN SCRIPT EXECUTING...");
                    try {
                        yield this._container.resolve(this._shutdownScriptKey).run();
                        yield this._logger.logInfo("SHUTDOWN SCRIPT COMPLETE");
                    }
                    catch (error) {
                        yield this._logger.logWarning("SHUTDOWN SCRIPT ERROR");
                        yield this._logger.logWarning(error);
                    }
                }
            }),
            () => tslib_1.__awaiter(this, void 0, void 0, function* () {
                yield this._logger.logInfo("DISPOSE ACTIONS EXECUTING...");
                try {
                    yield Promise.allSettled(this._disposeActions.map(t => t()));
                    yield this._logger.logInfo("DISPOSE ACTIONS COMPLETE");
                }
                catch (error) {
                    yield this._logger.logWarning("DISPOSE ACTIONS ERROR");
                    yield this._logger.logError(error);
                }
            })
        ]);
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