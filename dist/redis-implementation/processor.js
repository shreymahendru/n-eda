"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Processor = void 0;
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
const n_util_1 = require("@nivinjoseph/n-util");
const eda_manager_1 = require("../eda-manager");
const broker_1 = require("./broker");
class Processor {
    constructor(manager, onEventReceived) {
        this._defaultDelayMS = 150;
        this._scheduler = null;
        this._processPromise = null;
        this._isDisposed = false;
        n_defensive_1.given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager);
        this._manager = manager;
        this._logger = this._manager.serviceLocator.resolve("Logger");
        n_defensive_1.given(onEventReceived, "onEventReceived").ensureHasValue().ensureIsFunction();
        this._onEventReceived = onEventReceived;
    }
    registerScheduler(scheduler) {
        n_defensive_1.given(scheduler, "scheduler").ensureHasValue().ensureIsObject().ensureIsType(broker_1.Scheduler);
        this._scheduler = scheduler;
    }
    process() {
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException("Processor");
        n_defensive_1.given(this, "this").ensure(t => !t._processPromise, "processing has already commenced");
        this._processPromise = this.beginProcessing();
    }
    dispose() {
        if (!this._isDisposed)
            this._isDisposed = true;
        return this._processPromise || Promise.resolve();
    }
    beginProcessing() {
        return __awaiter(this, void 0, void 0, function* () {
            while (true) {
                if (this._isDisposed)
                    return;
                const workItem = this._scheduler.next();
                if (workItem == null) {
                    yield n_util_1.Delay.milliseconds(this._defaultDelayMS);
                    continue;
                }
                const maxProcessAttempts = 5;
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
                            yield this.processEvent(workItem, numProcessAttempts);
                            successful = true;
                            workItem.deferred.resolve();
                            break;
                        }
                        catch (error) {
                            if (numProcessAttempts >= maxProcessAttempts)
                                throw error;
                            else
                                yield n_util_1.Delay.milliseconds(100 * numProcessAttempts);
                        }
                    }
                }
                catch (error) {
                    yield this._logger.logWarning(`Failed to process event of type '${workItem.eventName}' with data ${JSON.stringify(workItem.event.serialize())}`);
                    yield this._logger.logError(error);
                    workItem.deferred.reject(error);
                }
            }
        });
    }
    processEvent(workItem, numAttempt) {
        return __awaiter(this, void 0, void 0, function* () {
            const scope = this._manager.serviceLocator.createScope();
            workItem.event.$scope = scope;
            this._onEventReceived(scope, workItem.topic, workItem.event);
            const handler = scope.resolve(workItem.eventRegistration.eventHandlerTypeName);
            try {
                yield handler.handle(workItem.event);
                yield this._logger.logInfo(`Executed EventHandler '${workItem.eventRegistration.eventHandlerTypeName}' for event '${workItem.eventName}' with id '${workItem.eventId}' => ConsumerGroupId: ${this._manager.consumerGroupId}; Topic: ${workItem.topic}; Partition: ${workItem.partition};`);
            }
            catch (error) {
                yield this._logger.logWarning(`Error in EventHandler while handling event of type '${workItem.eventName}' (ATTEMPT = ${numAttempt}) with data ${JSON.stringify(workItem.event.serialize())}.`);
                yield this._logger.logWarning(error);
                throw error;
            }
            finally {
                yield scope.dispose();
            }
        });
    }
}
exports.Processor = Processor;
//# sourceMappingURL=processor.js.map