"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcServer = void 0;
const tslib_1 = require("tslib");
const n_config_1 = require("@nivinjoseph/n-config");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_ject_1 = require("@nivinjoseph/n-ject");
const n_log_1 = require("@nivinjoseph/n-log");
const n_svc_1 = require("@nivinjoseph/n-svc");
const n_util_1 = require("@nivinjoseph/n-util");
const Http = require("http");
const Url = require("url");
const rpc_event_handler_1 = require("./rpc-event-handler");
class RpcServer {
    constructor(port, host, container, logger) {
        this._startupScriptKey = "$startupScript";
        this._hasStartupScript = false;
        this._shutdownScriptKey = "$shutdownScript";
        this._hasShutdownScript = false;
        this._disposeActions = new Array();
        this._isBootstrapped = false;
        this._shutdownManager = null;
        (0, n_defensive_1.given)(port, "port").ensureHasValue().ensureIsNumber();
        this._port = port;
        (0, n_defensive_1.given)(host, "host").ensureIsString();
        this._host = host ? host.trim() : null;
        (0, n_defensive_1.given)(container, "container").ensureHasValue().ensureIsType(n_ject_1.Container);
        this._container = container;
        (0, n_defensive_1.given)(logger, "logger").ensureIsObject();
        this._logger = logger !== null && logger !== void 0 ? logger : new n_log_1.ConsoleLogger({
            useJsonFormat: n_config_1.ConfigurationManager.getConfig("env") !== "dev"
        });
    }
    registerEventHandler(eventHandler) {
        (0, n_defensive_1.given)(eventHandler, "eventHandler").ensureHasValue().ensureIsInstanceOf(rpc_event_handler_1.RpcEventHandler);
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
            yield this._logger.logInfo("RPC SERVER STARTED");
        }))
            .catch((e) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield this._logger.logWarning("RPC SERVER STARTUP FAILED");
            yield this._logger.logError(e);
            throw e;
        }));
    }
    _configureContainer() {
        this.registerDisposeAction(() => this._container.dispose());
    }
    _configureStartup() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield this._logger.logInfo("RPC SERVER STARTING...");
            if (this._hasStartupScript)
                yield this._container.resolve(this._startupScriptKey).run();
        });
    }
    _configureServer() {
        const server = Http.createServer((req, res) => {
            if (this._shutdownManager == null || this._shutdownManager.isShutdown) {
                res.writeHead(503);
                res.end("SERVER UNAVAILABLE");
                return;
            }
            const requestPath = Url.parse(req.url, true).pathname;
            switch (requestPath) {
                case "/health":
                    res.writeHead(200);
                    res.end();
                    break;
                case "/process":
                    {
                        let data = "";
                        req.on('data', chunk => {
                            data += chunk;
                        });
                        req.on('end', () => {
                            this._eventHandler.process(JSON.parse(data))
                                .then((result) => {
                                // if ((<any>result).statusCode != null)
                                // {
                                //     res.setHeader("Content-Type", "application/json");
                                //     res.writeHead(500);
                                //     res.end(JSON.stringify(result));
                                // }
                                res.setHeader("Content-Type", "application/json");
                                res.writeHead(200);
                                res.end(JSON.stringify(result));
                            })
                                .catch(error => {
                                this._logger.logError(error)
                                    .finally(() => {
                                    res.writeHead(500);
                                    res.end();
                                });
                            });
                        });
                        break;
                    }
                default:
                    res.writeHead(404);
                    res.end();
                    break;
            }
        });
        return new Promise((resolve, _reject) => {
            var _a;
            this._server = server.listen(this._port, (_a = this._host) !== null && _a !== void 0 ? _a : undefined, () => {
                resolve();
            });
        });
    }
    _configureShutDown() {
        this.registerDisposeAction(() => tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield this._logger.logInfo("CLEANING UP. PLEASE WAIT...");
            // return Delay.seconds(ConfigurationManager.getConfig<string>("env") === "dev" ? 2 : 20);
        }));
        this._shutdownManager = new n_svc_1.ShutdownManager(this._logger, [
            () => tslib_1.__awaiter(this, void 0, void 0, function* () {
                const seconds = n_config_1.ConfigurationManager.getConfig("env") === "dev" ? 2 : 15;
                yield this._logger.logInfo(`BEGINNING WAIT (${seconds}S) FOR CONNECTION DRAIN...`);
                yield n_util_1.Delay.seconds(seconds);
                yield this._logger.logInfo("CONNECTION DRAIN COMPLETE");
            }),
            () => {
                return new Promise((resolve, reject) => {
                    this._logger.logInfo("CLOSING RPC SERVER...").finally(() => {
                        // eslint-disable-next-line @typescript-eslint/no-misused-promises
                        this._server.close((err) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                            if (err) {
                                yield this._logger.logWarning("RPC SERVER CLOSED WITH ERROR");
                                yield this._logger.logError(err);
                                reject(err);
                                return;
                            }
                            yield this._logger.logInfo("RPC SERVER CLOSED");
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
                        yield this._logger.logError(error);
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
        // const shutDown = (signal: string): void =>
        // {
        //     if (this._isShutDown)
        //         return;
        //     this._isShutDown = true;
        //     // eslint-disable-next-line @typescript-eslint/no-floating-promises
        //     Delay.seconds(ConfigurationManager.getConfig<string>("env") === "dev" ? 2 : 15).then(() =>
        //     {
        //         // eslint-disable-next-line @typescript-eslint/no-misused-promises
        //         this._server.close(async () =>
        //         {
        //             console.warn(`SERVER STOPPING (${signal}).`);
        //             if (this._hasShutdownScript)
        //             {
        //                 console.log("Shutdown script executing.");
        //                 try
        //                 {
        //                     await this._container.resolve<ApplicationScript>(this._shutdownScriptKey).run();
        //                     console.log("Shutdown script complete.");
        //                 }
        //                 catch (error)
        //                 {
        //                     console.warn("Shutdown script error.");
        //                     console.error(error);
        //                 }
        //             }
        //             console.log("Dispose actions executing.");
        //             try
        //             {
        //                 await Promise.all(this._disposeActions.map(t => t()));
        //                 console.log("Dispose actions complete.");
        //             }
        //             catch (error)
        //             {
        //                 console.warn("Dispose actions error.");
        //                 console.error(error);
        //             }
        //             console.warn(`SERVER STOPPED (${signal}).`);
        //             process.exit(0);
        //         });    
        //     });
        // };
        // process.on("SIGTERM", () => shutDown("SIGTERM"));
        // process.on("SIGINT", () => shutDown("SIGINT"));
    }
}
exports.RpcServer = RpcServer;
//# sourceMappingURL=rpc-server.js.map