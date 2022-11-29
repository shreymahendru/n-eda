import { given } from "@nivinjoseph/n-defensive";
import { ApplicationException, Exception, InvalidOperationException, ObjectDisposedException } from "@nivinjoseph/n-exception";
import { Logger } from "@nivinjoseph/n-log";
import { Delay, DelayCanceller, Disposable, Observable, Observer } from "@nivinjoseph/n-util";
import { EdaManager } from "../eda-manager";
import { EventHandlerTracer } from "../event-handler-tracer";
import { WorkItem } from "./scheduler";


export abstract class Processor implements Disposable
{
    private readonly _manager: EdaManager;
    private readonly _eventHandlerTracer: EventHandlerTracer | null;
    private readonly _hasEventHandlerTracer: boolean;
    private readonly _logger: Logger;
    private readonly _availabilityObserver = new Observer<this>("available");
    private readonly _doneProcessingObserver = new Observer<WorkItem>("done-processing");

    private _currentWorkItem: WorkItem | null = null;
    private _processPromise: Promise<void> | null = null;
    private _isDisposed = false;
    private _delayCanceller: DelayCanceller | null = null;


    private get _isInitialized(): boolean
    {
        return this._availabilityObserver.hasSubscriptions && this._doneProcessingObserver.hasSubscriptions;
    }

    protected get manager(): EdaManager { return this._manager; }
    protected get logger(): Logger { return this._logger; }

    public get availability(): Observable<this> { return this._availabilityObserver; }
    public get doneProcessing(): Observable<WorkItem> { return this._doneProcessingObserver; }
    public get isBusy(): boolean { return this._currentWorkItem != null; }


    public constructor(manager: EdaManager)
    {
        given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(EdaManager);
        this._manager = manager;

        this._eventHandlerTracer = this._manager.eventHandlerTracer;
        this._hasEventHandlerTracer = this._eventHandlerTracer != null;

        this._logger = this._manager.serviceLocator.resolve<Logger>("Logger");
    }


    public process(workItem: WorkItem): void
    {
        if (!this._isInitialized || this.isBusy)
            throw new InvalidOperationException("processor not initialized or processor is busy");

        if (this._isDisposed)
        {
            workItem.deferred.reject(new ObjectDisposedException("Processor"));
            return;
        }

        this._currentWorkItem = workItem;

        this._processPromise = this._process()
            .then(() =>
            {
                const doneWorkItem = this._currentWorkItem!;
                this._doneProcessingObserver.notify(doneWorkItem);
                this._currentWorkItem = null;
                if (!this._isDisposed)
                    this._availabilityObserver.notify(this);
            })
            .catch((e) => this._logger.logError(e));
    }

    public dispose(): Promise<void>
    {
        if (!this._isDisposed)
            this._isDisposed = true;
            
        if (this._delayCanceller)
            this._delayCanceller.cancel!();

        return this._processPromise || Promise.resolve();
    }

    protected abstract processEvent(workItem: WorkItem): Promise<void>;

    private async _process(): Promise<void>
    {
        const workItem = this._currentWorkItem!;

        const maxProcessAttempts = 10;
        let numProcessAttempts = 0;
        try 
        {
            while (numProcessAttempts < maxProcessAttempts)
            {
                if (this._isDisposed)
                {
                    workItem.deferred.reject(new ObjectDisposedException("Processor"));
                    return;
                }

                numProcessAttempts++;

                try 
                {
                    // await this._logger.logInfo(`Processing event ${workItem.eventName} with id ${workItem.eventId}`);

                    if (this._hasEventHandlerTracer)
                        await this._eventHandlerTracer!({
                            topic: workItem.topic,
                            partition: workItem.partition,
                            partitionKey: workItem.partitionKey,
                            eventName: workItem.eventName,
                            eventId: workItem.eventId
                        }, () => this.processEvent(workItem));

                    else
                        await this.processEvent(workItem);
                    workItem.deferred.resolve();
                    return;
                }
                catch (error)
                {
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    if (this._isDisposed)
                    {
                        workItem.deferred.reject(new ObjectDisposedException("Processor"));
                        return;
                    }
                    
                    if (numProcessAttempts >= maxProcessAttempts)
                        throw error;
                    else
                    {
                        if (numProcessAttempts > 7)
                        {
                            await this.logger.logWarning(`Error in EventHandler while handling event of type '${workItem.eventName}' (ATTEMPT = ${numProcessAttempts}) with data ${JSON.stringify(workItem.event.serialize())}.`);
                            await this.logger.logWarning(error as Exception);       
                        }
                        
                        this._delayCanceller = {};
                        await Delay.seconds((5 + numProcessAttempts) * numProcessAttempts, this._delayCanceller); // [6, 14, 24, 36, 50, 66, 84, 104, 126]
                        this._delayCanceller = null;
                    } 
                }
            }
        }
        catch (error)
        {
            const message = `Failed to process event of type '${workItem.eventName}' with data ${JSON.stringify(workItem.event.serialize())}`;
            await this._logger.logWarning(message);
            await this._logger.logError(error as Exception);
            workItem.deferred.reject(new ApplicationException(message, error as Exception));
        }
    }
}