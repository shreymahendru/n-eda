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
        (0, n_defensive_1.given)(this, "this")
            .ensure(t => t._isInitialized, "processor not initialized")
            .ensure(t => !t.isBusy, "processor is busy");
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException("Processor");
        this._currentWorkItem = workItem;
        this._processPromise = this._process()
            .then(() => {
            const doneWorkItem = this._currentWorkItem;
            this._doneProcessingObserver.notify(doneWorkItem);
            this._currentWorkItem = null;
            this._availabilityObserver.notify(this);
        })
            .catch((e) => this._logger.logError(e));
    }
    dispose() {
        if (!this._isDisposed)
            this._isDisposed = true;
        return this._processPromise || Promise.resolve();
    }
    _process() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const workItem = this._currentWorkItem;
            const maxProcessAttempts = 10;
            let numProcessAttempts = 0;
            let successful = false;
            try {
                while (successful === false && numProcessAttempts < maxProcessAttempts) {
                    if (this._isDisposed) {
                        workItem.deferred.reject(new n_exception_1.ObjectDisposedException("Processor"));
                        return;
                    }
                    numProcessAttempts++;
                    try {
                        if (this._hasEventHandlerTracer)
                            yield this._eventHandlerTracer({
                                topic: workItem.topic,
                                partition: workItem.partition,
                                partitionKey: workItem.partitionKey,
                                eventName: workItem.eventName,
                                eventId: workItem.eventId
                            }, ((npa) => () => this.processEvent(workItem, npa))(numProcessAttempts));
                        else
                            yield this.processEvent(workItem, numProcessAttempts);
                        successful = true;
                        workItem.deferred.resolve();
                        break;
                    }
                    catch (error) {
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                        if (numProcessAttempts >= maxProcessAttempts || this._isDisposed)
                            throw error;
                        else
                            yield n_util_1.Delay.seconds(2 * numProcessAttempts);
                    }
                }
            }
            catch (error) {
                yield this._logger.logWarning(`Failed to process event of type '${workItem.eventName}' with data ${JSON.stringify(workItem.event.serialize())}`);
                yield this._logger.logError(error);
                workItem.deferred.reject(error);
            }
        });
    }
}
exports.Processor = Processor;
//# sourceMappingURL=processor.js.map