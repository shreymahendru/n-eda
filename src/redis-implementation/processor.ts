import { given } from "@nivinjoseph/n-defensive";
import { ObjectDisposedException } from "@nivinjoseph/n-exception";
import { ServiceLocator } from "@nivinjoseph/n-ject";
import { Logger } from "@nivinjoseph/n-log";
import { Delay, Disposable, Observer, Subscription } from "@nivinjoseph/n-util";
import { EdaEvent } from "../eda-event";
import { EdaEventHandler } from "../eda-event-handler";
import { EdaManager } from "../eda-manager";
import { WorkItem } from "./broker";


export class Processor implements Disposable
{
    private readonly _manager: EdaManager;
    private readonly _logger: Logger;
    private readonly _onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void;
    
    
    private _availabilityObserver: Observer<this> | null = null;
    private _currentWorkItem: WorkItem | null = null;
    private _processPromise: Promise<void> | null = null;
    private _isDisposed = false;
    
    
    private get _isInitialized(): boolean { return this._availabilityObserver != null; }
    
    public get isBusy(): boolean { return this._currentWorkItem != null; }
    
    
    public constructor(manager: EdaManager, onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void)
    {
        given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(EdaManager);
        this._manager = manager;

        this._logger = this._manager.serviceLocator.resolve<Logger>("Logger");
        
        given(onEventReceived, "onEventReceived").ensureHasValue().ensureIsFunction();
        this._onEventReceived = onEventReceived;
    }
    
    
    public initialize(availabilityCallback: (p: this) => void): Subscription
    {
        given(availabilityCallback, "availabilityCallback").ensureHasValue().ensureIsFunction();
        
        given(this, "this").ensure(t => !t._isInitialized);
        
        if (this._isDisposed)
            throw new ObjectDisposedException(this);
        
        this._availabilityObserver = new Observer<this>("available", availabilityCallback);
        return this._availabilityObserver.subscription;
    }
    
    public process(workItem: WorkItem): void
    {
        given(this, "this")
            .ensure(t => t._isInitialized, "processor not initialized")
            .ensure(t => !t.isBusy, "processor is busy");
        
        if (this._isDisposed)
            throw new ObjectDisposedException("Processor");

        this._currentWorkItem = workItem;
        
        this._processPromise = this._process()
            .then(() =>
            {
                this._currentWorkItem = null;
                this._availabilityObserver!.notify(this);
            })
            .catch((e) => this._logger.logError(e));
    }
    
    public dispose(): Promise<void>
    {
        if (!this._isDisposed)
            this._isDisposed = true;

        return this._processPromise || Promise.resolve();
    }
    
    private async _process(): Promise<void>
    {
        const workItem = this._currentWorkItem!;

        const maxProcessAttempts = 5;
        let numProcessAttempts = 0;
        let successful = false;
        try 
        {
            while (successful === false && numProcessAttempts < maxProcessAttempts)
            {
                if (this._isDisposed)
                {
                    workItem.deferred.reject(new ObjectDisposedException("Processor"));
                    return;
                }

                numProcessAttempts++;

                try 
                {
                    await this.processEvent(workItem, numProcessAttempts);
                    successful = true;
                    workItem.deferred.resolve();
                    break;
                }
                catch (error)
                {
                    if (numProcessAttempts >= maxProcessAttempts || this._isDisposed)
                        throw error;
                    else
                        await Delay.milliseconds(100 * numProcessAttempts);
                }
            }
        }
        catch (error)
        {
            await this._logger.logWarning(`Failed to process event of type '${workItem.eventName}' with data ${JSON.stringify(workItem.event.serialize())}`);
            await this._logger.logError(error);
            workItem.deferred.reject(error);
        }
    }
    
    private async processEvent(workItem: WorkItem, numAttempt: number): Promise<void>
    {
        const scope = this._manager.serviceLocator.createScope();
        (<any>workItem.event).$scope = scope;

        this._onEventReceived(scope, workItem.topic, workItem.event);

        const handler = scope.resolve<EdaEventHandler<EdaEvent>>(workItem.eventRegistration.eventHandlerTypeName);

        try 
        {
            await handler.handle(workItem.event);

            await this._logger.logInfo(`Executed EventHandler '${workItem.eventRegistration.eventHandlerTypeName}' for event '${workItem.eventName}' with id '${workItem.eventId}' => ConsumerGroupId: ${this._manager.consumerGroupId}; Topic: ${workItem.topic}; Partition: ${workItem.partition};`);
        }
        catch (error)
        {
            await this._logger.logWarning(`Error in EventHandler while handling event of type '${workItem.eventName}' (ATTEMPT = ${numAttempt}) with data ${JSON.stringify(workItem.event.serialize())}.`);
            await this._logger.logWarning(error);
            throw error;
        }
        finally
        {
            await scope.dispose();
        }
    }
}