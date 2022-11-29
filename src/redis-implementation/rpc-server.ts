import { ConfigurationManager } from "@nivinjoseph/n-config";
import { given } from "@nivinjoseph/n-defensive";
import { Container } from "@nivinjoseph/n-ject";
import { ConsoleLogger, Logger } from "@nivinjoseph/n-log";
import { ClassHierarchy, Delay } from "@nivinjoseph/n-util";
import * as Http from "http";
import * as Url from "url";
import { ApplicationScript } from "./application-script";
import { RpcEventHandler } from "./rpc-event-handler";


export class RpcServer
{
    private readonly _port: number;
    private readonly _host: string | null;
    private readonly _container: Container;
    private readonly _logger: Logger;

    private readonly _startupScriptKey = "$startupScript";
    private _hasStartupScript = false;

    private readonly _shutdownScriptKey = "$shutdownScript";
    private _hasShutdownScript = false;

    private readonly _disposeActions = new Array<() => Promise<void>>();

    private _eventHandler!: RpcEventHandler;

    private _server!: Http.Server;
    private _isBootstrapped = false;

    private _isShutDown = false;


    public constructor(port: number, host: string | null, container: Container, logger?: Logger | null)
    {
        given(port, "port").ensureHasValue().ensureIsNumber();
        this._port = port;

        given(host as string, "host").ensureIsString();
        this._host = host ? host.trim() : null;

        given(container, "container").ensureHasValue().ensureIsType(Container);
        this._container = container;

        given(logger as Logger, "logger").ensureIsObject();
        this._logger = logger ?? new ConsoleLogger();
    }

    public registerEventHandler(eventHandler: RpcEventHandler): this
    {
        given(eventHandler, "eventHandler").ensureHasValue().ensureIsInstanceOf(RpcEventHandler);

        given(this, "this").ensure(t => !t._isBootstrapped, "cannot invoke after bootstrap");

        this._eventHandler = eventHandler;

        return this;
    }

    public registerStartupScript(applicationScriptClass: ClassHierarchy<ApplicationScript>): this
    {
        given(applicationScriptClass, "applicationScriptClass").ensureHasValue().ensureIsFunction();

        given(this, "this").ensure(t => !t._isBootstrapped, "cannot invoke after bootstrap");

        this._container.registerSingleton(this._startupScriptKey, applicationScriptClass);
        this._hasStartupScript = true;
        return this;
    }

    public registerShutdownScript(applicationScriptClass: ClassHierarchy<ApplicationScript>): this
    {
        given(applicationScriptClass, "applicationScriptClass").ensureHasValue().ensureIsFunction();

        given(this, "this").ensure(t => !t._isBootstrapped, "cannot invoke after bootstrap");

        this._container.registerSingleton(this._shutdownScriptKey, applicationScriptClass);
        this._hasShutdownScript = true;
        return this;
    }

    public registerDisposeAction(disposeAction: () => Promise<void>): this
    {
        given(disposeAction, "disposeAction").ensureHasValue().ensureIsFunction();

        given(this, "this").ensure(t => !t._isBootstrapped, "cannot invoke after bootstrap");

        this._disposeActions.push(() =>
        {
            return new Promise((resolve) =>
            {
                try 
                {
                    disposeAction()
                        .then(() => resolve())
                        .catch((e) =>
                        {
                            console.error(e);
                            resolve();
                        });
                }
                catch (error)
                {
                    console.error(error);
                    resolve();
                }
            });
        });
        return this;
    }

    public bootstrap(): void
    {
        given(this, "this")
            .ensure(t => !t._isBootstrapped, "already bootstrapped")
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            .ensure(t => t._eventHandler != null, "No event handler registered");


        this._configureContainer();

        this._configureStartup()
            .then(() => this._configureServer())
            .then(() =>
            {
                const appEnv = ConfigurationManager.getConfig<string>("env");
                const appName = ConfigurationManager.getConfig<string>("package.name");
                const appVersion = ConfigurationManager.getConfig<string>("package.version");
                const appDescription = ConfigurationManager.getConfig<string>("package.description");

                console.log(`ENV: ${appEnv}; NAME: ${appName}; VERSION: ${appVersion}; DESCRIPTION: ${appDescription}.`);

                this._configureShutDown();

                this._isBootstrapped = true;
                console.log("SERVER STARTED.");
            })
            .catch(e =>
            {
                console.error("STARTUP FAILED!!!");
                console.error(e);
                throw e;
            });
    }

    private _configureContainer(): void
    {
        this.registerDisposeAction(() => this._container.dispose());
    }

    private _configureStartup(): Promise<void>
    {
        console.log("SERVER STARTING.");

        if (!this._hasStartupScript)
            return Promise.resolve();

        return this._container.resolve<ApplicationScript>(this._startupScriptKey).run();
    }

    private _configureServer(): Promise<void>
    {
        const server = Http.createServer((req, res) =>
        {
            if (this._isShutDown)
            {
                res.writeHead(503);
                res.end("SERVER UNAVAILABLE");
                return;
            }
            
            const requestPath = Url.parse(req.url!, true).pathname;

            switch (requestPath)
            {
                case "/health":
                    res.writeHead(200);
                    res.end();
                    break;
                case "/process":
                    {
                        let data = "";
                        req.on('data', chunk =>
                        {
                            data += chunk;
                        });
                        req.on('end', () =>
                        {
                            this._eventHandler.process(JSON.parse(data))
                                .then((result) =>
                                {
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
                                .catch(error =>
                                {
                                    this._logger.logError(error)
                                        .finally(() =>
                                        {
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

        return new Promise((resolve, _reject) =>
        {
            this._server = server.listen(this._port, this._host ?? undefined, () =>
            {
                resolve();
            });
        });
    }

    private _configureShutDown(): void
    {
        this.registerDisposeAction(() =>
        {
            console.log("CLEANING UP. PLEASE WAIT...");
            return Delay.seconds(ConfigurationManager.getConfig<string>("env") === "dev" ? 2 : 20);
        });

        const shutDown = (signal: string): void =>
        {
            if (this._isShutDown)
                return;

            this._isShutDown = true;
            
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            Delay.seconds(5).then(() =>
            {
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                this._server.close(async () =>
                {
                    console.warn(`SERVER STOPPING (${signal}).`);

                    if (this._hasShutdownScript)
                    {
                        console.log("Shutdown script executing.");
                        try
                        {
                            await this._container.resolve<ApplicationScript>(this._shutdownScriptKey).run();
                            console.log("Shutdown script complete.");
                        }
                        catch (error)
                        {
                            console.warn("Shutdown script error.");
                            console.error(error);
                        }
                    }

                    console.log("Dispose actions executing.");
                    try
                    {
                        await Promise.all(this._disposeActions.map(t => t()));
                        console.log("Dispose actions complete.");
                    }
                    catch (error)
                    {
                        console.warn("Dispose actions error.");
                        console.error(error);
                    }

                    console.warn(`SERVER STOPPED (${signal}).`);
                    process.exit(0);
                });    
            });
        };

        process.on("SIGTERM", () => shutDown("SIGTERM"));
        process.on("SIGINT", () => shutDown("SIGINT"));
    }
}