"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Processor = void 0;
const tslib_1 = require("tslib");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
const n_util_1 = require("@nivinjoseph/n-util");
const eda_manager_1 = require("../eda-manager");
class Processor {
    constructor(manager) {
        this._availabilityObserver = new n_util_1.Observer("available");
        this._doneProcessingObserver = new n_util_1.Observer("done-processing");
        this._currentWorkItem = null;
        this._processPromise = null;
        this._isDisposed = false;
        this._delayCanceller = null;
        (0, n_defensive_1.given)(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager);
        this._manager = manager;
        this._eventHandlerTracer = this._manager.eventHandlerTracer;
        this._hasEventHandlerTracer = this._eventHandlerTracer != null;
        this._logger = this._manager.serviceLocator.resolve("Logger");
    }
    get _isInitialized() {
        return this._availabilityObserver.hasSubscriptions && this._doneProcessingObserver.hasSubscriptions;
    }
    get manager() { return this._manager; }
    get logger() { return this._logger; }
    get availability() { return this._availabilityObserver; }
    get doneProcessing() { return this._doneProcessingObserver; }
    get isBusy() { return this._currentWorkItem != null; }
    process(workItem) {
        if (!this._isInitialized || this.isBusy)
            throw new n_exception_1.InvalidOperationException("processor not initialized or processor is busy");
        if (this._isDisposed) {
            workItem.deferred.reject(new n_exception_1.ObjectDisposedException("Processor"));
            return;
        }
        this._currentWorkItem = workItem;
        this._processPromise = this._process()
            .then(() => {
            const doneWorkItem = this._currentWorkItem;
            this._doneProcessingObserver.notify(doneWorkItem);
            this._currentWorkItem = null;
            if (!this._isDisposed)
                this._availabilityObserver.notify(this);
        })
            .catch((e) => this._logger.logError(e));
    }
    dispose() {
        if (!this._isDisposed)
            this._isDisposed = true;
        if (this._delayCanceller)
            this._delayCanceller.cancel();
        return this._processPromise || Promise.resolve();
    }
    _process() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const workItem = this._currentWorkItem;
            const maxProcessAttempts = 10;
            let numProcessAttempts = 0;
            try {
                while (numProcessAttempts < maxProcessAttempts) {
                    if (this._isDisposed) {
                        workItem.deferred.reject(new n_exception_1.ObjectDisposedException("Processor"));
                        return;
                    }
                    numProcessAttempts++;
                    try {
                        // await this._logger.logInfo(`Processing event ${workItem.eventName} with id ${workItem.eventId}`);
                        if (this._hasEventHandlerTracer)
                            yield this._eventHandlerTracer({
                                topic: workItem.topic,
                                partition: workItem.partition,
                                partitionKey: workItem.partitionKey,
                                eventName: workItem.eventName,
                                eventId: workItem.eventId
                            }, () => this.processEvent(workItem));
                        else
                            yield this.processEvent(workItem);
                        workItem.deferred.resolve();
                        return;
                    }
                    catch (error) {
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                        if (this._isDisposed) {
                            workItem.deferred.reject(new n_exception_1.ObjectDisposedException("Processor"));
                            return;
                        }
                        if (numProcessAttempts > 8) {
                            yield this.logger.logWarning(`Error in EventHandler while handling event of type '${workItem.eventName}' (ATTEMPT = ${numProcessAttempts}) with data ${JSON.stringify(workItem.event.serialize())}.`);
                            yield this.logger.logWarning(error);
                        }
                        if (numProcessAttempts >= maxProcessAttempts)
                            throw error;
                        else {
                            this._delayCanceller = {};
                            yield n_util_1.Delay.seconds((5 + numProcessAttempts) * numProcessAttempts, this._delayCanceller); // [6, 14, 24, 36, 50, 66, 84, 104, 126]
                            this._delayCanceller = null;
                        }
                    }
                }
            }
            catch (error) {
                const message = `Failed to process event of type '${workItem.eventName}' with data ${JSON.stringify(workItem.event.serialize())}`;
                yield this._logger.logError(message);
                yield this._logger.logError(error);
                workItem.deferred.reject(new n_exception_1.ApplicationException(message, error));
            }
        });
    }
}
exports.Processor = Processor;
//# sourceMappingURL=processor.js.map