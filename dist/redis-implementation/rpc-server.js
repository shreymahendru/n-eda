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
        this._logger = logger !== null && logger !== void 0 ? logger : new n_log_1.ConsoleLogger();
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
        this.registerDisposeAction(() => {
            console.log("CLEANING UP. PLEASE WAIT...");
            // return Delay.seconds(ConfigurationManager.getConfig<string>("env") === "dev" ? 2 : 20);
            return Promise.resolve();
        });
        this._shutdownManager = new n_svc_1.ShutdownManager([
            () => n_util_1.Delay.seconds(n_config_1.ConfigurationManager.getConfig("env") === "dev" ? 2 : 15),
            () => {
                return new Promise((resolve, reject) => {
                    this._server.close((err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve();
                    });
                });
            },
            () => tslib_1.__awaiter(this, void 0, void 0, function* () {
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
            }),
            () => tslib_1.__awaiter(this, void 0, void 0, function* () {
                console.log("Dispose actions executing.");
                try {
                    yield Promise.all(this._disposeActions.map(t => t()));
                    console.log("Dispose actions complete.");
                }
                catch (error) {
                    console.warn("Dispose actions error.");
                    console.error(error);
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