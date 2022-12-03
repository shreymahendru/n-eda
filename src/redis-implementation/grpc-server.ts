import * as Path from "path";
import * as Grpc from "@grpc/grpc-js";
import * as ProtoLoader from "@grpc/proto-loader";
import { given } from "@nivinjoseph/n-defensive";
import { ConsoleLogger, Logger } from "@nivinjoseph/n-log";
import { Container } from "@nivinjoseph/n-ject";
import { ClassHierarchy, Delay } from "@nivinjoseph/n-util";
import { ConfigurationManager } from "@nivinjoseph/n-config";
import { GrpcEventHandler } from "./grpc-event-handler";
import { GrpcModel } from "../grpc-details";
import { ApplicationScript } from "./application-script";
import { ShutdownManager } from "@nivinjoseph/n-svc";


export class GrpcServer
{
    private readonly _port: number;
    private readonly _host: string;
    private readonly _container: Container;
    // @ts-expect-error: not used atm
    private readonly _logger: Logger;
    
    private readonly _startupScriptKey = "$startupScript";
    private _hasStartupScript = false;

    private readonly _shutdownScriptKey = "$shutdownScript";
    private _hasShutdownScript = false;
    
    private readonly _disposeActions = new Array<() => Promise<void>>();
    
    private _eventHandler!: GrpcEventHandler;
    
    private readonly _serviceName = "EdaService";
    
    private readonly _statusMap: Record<string, ServingStatus> = {
        "": ServingStatus.NOT_SERVING,
        [this._serviceName]: ServingStatus.NOT_SERVING
    };
    
    private _server!: Grpc.Server;
    private _isBootstrapped = false;

    private _shutdownManager: ShutdownManager | null = null;
    
    
    public constructor(port: number, host: string | null, container: Container, logger?: Logger | null)
    {
        given(port, "port").ensureHasValue().ensureIsNumber();
        this._port = port;
        
        given(host as string, "host").ensureIsString();
        this._host = host ? host.trim() : "0.0.0.0";
        
        given(container, "container").ensureHasValue().ensureIsType(Container);
        this._container = container;
        
        given(logger as Logger, "logger").ensureIsObject();
        this._logger = logger ?? new ConsoleLogger();
    }
    
    public registerEventHandler(eventHandler: GrpcEventHandler): this
    {
        given(eventHandler, "eventHandler").ensureHasValue().ensureIsInstanceOf(GrpcEventHandler);
        
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

        server.addService((serviceDef as any)[this._serviceName].service, {
            process: (call: any, callback: Function) =>
            {
                if (this._shutdownManager == null || this._shutdownManager.isShutdown)
                {
                    callback({ code: Grpc.status.UNAVAILABLE });
                    return;
                }
                
                const request = call.request as GrpcModel;
                
                this._eventHandler.process(request)
                    .then((response) =>
                    {
                        callback(null, response);
                    })
                    .catch(error =>
                    {
                        callback(error);
                    });
            }
        });
        
        const healthPackageDef = ProtoLoader.loadSync(Path.join(basePath, "grpc-health-check.proto"), options);
        const healthServiceDef = Grpc.loadPackageDefinition(healthPackageDef).grpchealthv1;

        server.addService((healthServiceDef as any)["Health"].service, {
            check: (_call: any, callback: Function) =>
            {
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
        

        return new Promise<void>((resolve, reject) =>
        {
            server.bindAsync(
                `${this._host}:${this._port}`,
                Grpc.ServerCredentials.createInsecure(),
                (error, _port) =>
                {
                    if (error != null)
                    {
                        reject(error);
                        return;
                    }

                    try 
                    {
                        // console.log(`Server running at http://127.0.0.1:${port}`);
                        server.start();
                        this._server = server;
                        this._changeStatus(ServingStatus.SERVING);
                    }
                    catch (error)
                    {
                        reject(error);
                        return;
                    }

                    resolve();
                }
            );
        });
    }
    
    private _configureShutDown(): void
    {
        // if (ConfigurationManager.getConfig<string>("env") === "dev")
        //     return;

        this.registerDisposeAction(() =>
        {
            console.log("CLEANING UP. PLEASE WAIT...");
            // return Delay.seconds(ConfigurationManager.getConfig<string>("env") === "dev" ? 2 : 20);
            return Promise.resolve();
        });
        
        this._shutdownManager = new ShutdownManager([
            (): Promise<void> =>
            {
                this._changeStatus(ServingStatus.NOT_SERVING);
                return Delay.seconds(ConfigurationManager.getConfig<string>("env") === "dev" ? 2 : 15);
            },
            (): Promise<void> =>
            {
                return new Promise((resolve, reject) =>
                {
                    this._server.tryShutdown((err) =>
                    {
                        if (err)
                        {
                            console.warn(err);
                            
                            try 
                            {        
                                this._server.forceShutdown();    
                            }
                            catch (error) 
                            {
                                reject(error);
                                return;
                            }
                        }
                        
                        resolve();
                    });
                });
            },
            async (): Promise<void> =>
            {
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
            },
            async (): Promise<void> =>
            {
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
            }
        ]);
    }
    
    private _changeStatus(status: ServingStatus): void
    {
        given(status, "status").ensureHasValue().ensureIsEnum(ServingStatus);
        
        this._statusMap[""] = this._statusMap[this._serviceName] = status;
    }
}

enum ServingStatus
{
    UNKNOWN = "UNKNOWN",
    SERVING = "SERVING",
    NOT_SERVING = "NOT_SERVING",
    SERVICE_UNKNOWN = "SERVICE_UNKNOWN" // Used only by the Watch method.
}