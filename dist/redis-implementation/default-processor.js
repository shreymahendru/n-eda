"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultProcessor = void 0;
const tslib_1 = require("tslib");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const processor_1 = require("./processor");
class DefaultProcessor extends processor_1.Processor {
    constructor(manager, onEventReceived) {
        super(manager);
        (0, n_defensive_1.given)(onEventReceived, "onEventReceived").ensureHasValue().ensureIsFunction();
        this._onEventReceived = onEventReceived;
    }
    processEvent(workItem, numAttempt) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            (0, n_defensive_1.given)(workItem, "workItem").ensureHasValue().ensureIsObject();
            (0, n_defensive_1.given)(numAttempt, "numAttempt").ensureHasValue().ensureIsNumber();
            const scope = this.manager.serviceLocator.createScope();
            workItem.event.$scope = scope;
            this._onEventReceived(scope, workItem.topic, workItem.event);
            const handler = scope.resolve(workItem.eventRegistration.eventHandlerTypeName);
            try {
                yield handler.handle(workItem.event);
                // await this._logger.logInfo(`Executed EventHandler '${workItem.eventRegistration.eventHandlerTypeName}' for event '${workItem.eventName}' with id '${workItem.eventId}' => ConsumerGroupId: ${this._manager.consumerGroupId}; Topic: ${workItem.topic}; Partition: ${workItem.partition};`);
            }
            catch (error) {
                yield this.logger.logWarning(`Error in EventHandler while handling event of type '${workItem.eventName}' (ATTEMPT = ${numAttempt}) with data ${JSON.stringify(workItem.event.serialize())}.`);
                yield this.logger.logWarning(error);
                throw error;
            }
            finally {
                yield scope.dispose();
            }
        });
    }
}
exports.DefaultProcessor = DefaultProcessor;
//# sourceMappingURL=default-processor.js.map