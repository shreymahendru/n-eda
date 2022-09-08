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
    
    private readonly _statusMap: Record<string, string> = {
        "": ServingStatus.NOT_SERVING,
        [this._serviceName]: ServingStatus.NOT_SERVING
    };
    
    private _server!: Grpc.Server;
    private _isBootstrapped = false;

    private _isShutDown = false;
    
    
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
                const request = call.request as GrpcModel;
                
                this._eventHandler.process(request)
                    .then((response) =>
                    {
                        callback(null, response);
                    })
                    .catch(error =>
                    {
                        callback(error.message);
                    });
            }
        });
        
        const healthPackageDef = ProtoLoader.loadSync(Path.join(basePath, "grpc-health-check.proto"), options);
        const healthServiceDef = Grpc.loadPackageDefinition(healthPackageDef)["grpc.health.v1"];

        server.addService((healthServiceDef as any).Health.service, {
            check: (call: any, callback: Function) =>
            {
                const { service } = call.request;
                const status = this._statusMap[service];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (status == null)
                {
                    callback({ code: Grpc.status.NOT_FOUND });
                }
                else
                {
                    callback(null, { status });
                }
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
            return Delay.seconds(ConfigurationManager.getConfig<string>("env") === "dev" ? 2 : 20);
        });

        const shutDown = (signal: string): void =>
        {
            if (this._isShutDown)
                return;

            this._isShutDown = true;
            this._changeStatus(ServingStatus.NOT_SERVING);

            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            this._server.tryShutdown(async (error) =>
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
                
                if (error)
                {
                    console.warn("Error while trying to shutdown server");
                    console.error(error);
                    
                    try 
                    {
                        this._server.forceShutdown();
                    }
                    catch (error)
                    {
                        console.warn("Error while forcing server shutdown");
                        console.error(error);
                    }
                }

                console.warn(`SERVER STOPPED (${signal}).`);
                process.exit(0);
            });
        };

        process.on("SIGTERM", () => shutDown("SIGTERM"));
        process.on("SIGINT", () => shutDown("SIGINT"));
    }
    
    private _changeStatus(status: ServingStatus): void
    {
        given(status, "status").ensureHasValue().ensureIsEnum(ServingStatus);
        
        this._statusMap[""] = this._statusMap[this._serviceName] = status;
    }
}

export interface ApplicationScript
{
    run(): Promise<void>;
}

enum ServingStatus
{
    UNKNOWN = "UNKNOWN",
    SERVING = "SERVING",
    NOT_SERVING = "NOT_SERVING",
    SERVICE_UNKNOWN = "SERVICE_UNKNOWN" // Used only by the Watch method.
}