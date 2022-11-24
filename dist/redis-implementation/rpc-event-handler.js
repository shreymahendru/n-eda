"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcEventHandler = void 0;
const tslib_1 = require("tslib");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
const n_util_1 = require("@nivinjoseph/n-util");
const eda_manager_1 = require("../eda-manager");
class RpcEventHandler {
    constructor() {
        this._manager = null;
        this._logger = null;
    }
    initialize(manager) {
        (0, n_defensive_1.given)(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager)
            .ensure(t => t.isRpcConsumer, "RPC consumer not enabled");
        this._manager = manager;
        this._logger = this._manager.serviceLocator.resolve("Logger");
    }
    process(model) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            try {
                (0, n_defensive_1.given)(model, "model").ensureHasValue().ensureIsObject();
                (0, n_defensive_1.given)(this, "this").ensure(t => t._manager != null, "not initialized");
                const eventData = {
                    consumerId: model.consumerId,
                    topic: model.topic,
                    partition: model.partition,
                    eventName: model.eventName,
                    event: n_util_1.Deserializer.deserialize(model.payload)
                };
                yield this._process(eventData);
                return {
                    eventName: eventData.eventName,
                    eventId: eventData.event.id
                };
            }
            catch (error) {
                return {
                    statusCode: 500,
                    error: this._getErrorMessage(error)
                };
            }
        });
    }
    onEventReceived(scope, topic, event) {
        (0, n_defensive_1.given)(scope, "scope").ensureHasValue().ensureIsObject();
        (0, n_defensive_1.given)(topic, "topic").ensureHasValue().ensureIsString();
        (0, n_defensive_1.given)(event, "event").ensureHasValue().ensureIsObject();
    }
    _process(data) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            // given(data, "data").ensureHasValue().ensureIsObject()
            //     .ensureHasStructure({
            //         consumerId: "string",
            //         topic: "string",
            //         partition: "number",
            //         eventName: "string",
            //         event: "object"
            //     });
            const eventRegistration = this._manager.eventMap.get(data.eventName);
            const scope = this._manager.serviceLocator.createScope();
            data.event.$scope = scope;
            this.onEventReceived(scope, data.topic, data.event);
            const handler = scope.resolve(eventRegistration.eventHandlerTypeName);
            try {
                yield handler.handle(data.event);
            }
            catch (error) {
                yield this._logger.logWarning(`Error in RPC event handler while handling event of type '${data.eventName}' with data ${JSON.stringify(data.event.serialize())}.`);
                yield this._logger.logError(error);
                throw error;
            }
            finally {
                yield scope.dispose();
            }
        });
    }
    _getErrorMessage(exp) {
        let logMessage = "";
        try {
            if (exp instanceof n_exception_1.Exception)
                logMessage = exp.toString();
            else if (exp instanceof Error)
                logMessage = exp.stack;
            else
                logMessage = exp.toString();
        }
        catch (error) {
            console.warn(error);
            logMessage = "There was an error while attempting to log another message.";
        }
        return logMessage;
    }
}
exports.RpcEventHandler = RpcEventHandler;
//# sourceMappingURL=rpc-event-handler.js.map