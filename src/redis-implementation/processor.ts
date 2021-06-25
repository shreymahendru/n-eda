import { given } from "@nivinjoseph/n-defensive";
import { ObjectDisposedException } from "@nivinjoseph/n-exception";
import { ServiceLocator } from "@nivinjoseph/n-ject";
import { Logger } from "@nivinjoseph/n-log";
import { Delay, Disposable } from "@nivinjoseph/n-util";
import { EdaEvent } from "../eda-event";
import { EdaEventHandler } from "../eda-event-handler";
import { EdaManager } from "../eda-manager";
import { Scheduler, WorkItem } from "./broker";


export class Processor implements Disposable
{
    private readonly _defaultDelayMS = 150;
    private readonly _manager: EdaManager;
    private readonly _logger: Logger;
    private readonly _onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void;
    
    private _scheduler: Scheduler = null as any;
    private _processPromise: Promise<void> | null = null;
    private _isDisposed = false;
    
    
    public constructor(manager: EdaManager, onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void)
    {
        given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(EdaManager);
        this._manager = manager;

        this._logger = this._manager.serviceLocator.resolve<Logger>("Logger");
        
        given(onEventReceived, "onEventReceived").ensureHasValue().ensureIsFunction();
        this._onEventReceived = onEventReceived;
    }
    
    
    public registerScheduler(scheduler: Scheduler): void
    {
        given(scheduler, "scheduler").ensureHasValue().ensureIsObject().ensureIsType(Scheduler);
        this._scheduler = scheduler;
    }
    
    public process(): void
    {
        if (this._isDisposed)
            throw new ObjectDisposedException(this);

        given(this, "this").ensure(t => !t._processPromise, "processing has already commenced");

        this._processPromise = this.beginProcessing();
    }
    
    public dispose(): Promise<void>
    {
        if (!this._isDisposed)
            this._isDisposed = true;

        return this._processPromise || Promise.resolve();
    }
    
    private async beginProcessing(): Promise<void>
    {
        while (true)
        {
            if (this._isDisposed)
                return;

            const workItem = this._scheduler.next();
            
            if (workItem == null)
            {
                await Delay.milliseconds(this._defaultDelayMS);
                continue;
            }
            
            const maxProcessAttempts = 5;
            let numProcessAttempts = 0;
            let successful = false;
            try 
            {
                while (successful === false && numProcessAttempts < maxProcessAttempts)
                {
                    if (this._isDisposed)
                    {
                        workItem.deferred.reject(new ObjectDisposedException(this));
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
                        if (numProcessAttempts >= maxProcessAttempts)
                            throw error;
                        else
                            await Delay.milliseconds(100 * numProcessAttempts);
                    }
                }
            }
            catch (error)
            {
                await this._logger.logWarning(`Failed to process event of type '${workItem.eventName}' with data ${JSON.stringify(workItem.event)}`);
                await this._logger.logError(error);
                workItem.deferred.reject(error);
            }
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