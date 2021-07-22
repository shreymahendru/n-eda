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
exports.AwsLambdaEventHandler = void 0;
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_util_1 = require("@nivinjoseph/n-util");
const eda_manager_1 = require("../eda-manager");
class AwsLambdaEventHandler {
    constructor(manager) {
        n_defensive_1.given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager)
            .ensure(t => t.isAwsLambdaConsumer, "AWS Lambda consumer not enabled");
        this._manager = manager;
        this._logger = this._manager.serviceLocator.resolve("Logger");
    }
    process(event, context) {
        return __awaiter(this, void 0, void 0, function* () {
            n_defensive_1.given(event, "event").ensureHasValue().ensureIsObject();
            n_defensive_1.given(context, "context").ensureHasValue().ensureIsObject();
            const ctx = context.clientContext;
            const eventData = {
                consumerId: ctx.consumerId,
                topic: ctx.topic,
                partition: ctx.partition,
                eventName: ctx.eventName,
                event: n_util_1.Deserializer.deserialize(event)
            };
            yield this._process(eventData);
            return {
                eventName: eventData.eventName,
                eventId: eventData.event.id,
            };
        });
    }
    _process(data) {
        return __awaiter(this, void 0, void 0, function* () {
            n_defensive_1.given(data, "data").ensureHasValue().ensureIsObject()
                .ensureHasStructure({
                consumerId: "string",
                topic: "string",
                partition: "number",
                eventName: "string",
                event: "object"
            });
            const eventRegistration = this._manager.eventMap.get(data.eventName);
            const scope = this._manager.serviceLocator.createScope();
            data.event.$scope = scope;
            this.onEventReceived(scope, data.topic, data.event);
            const handler = scope.resolve(eventRegistration.eventHandlerTypeName);
            try {
                yield handler.handle(data.event);
            }
            catch (error) {
                yield this._logger.logWarning(`Error in EventHandler while handling event of type '${data.eventName}' with data ${JSON.stringify(data.event.serialize())}.`);
                yield this._logger.logWarning(error);
                throw error;
            }
            finally {
                yield scope.dispose();
            }
        });
    }
    onEventReceived(scope, topic, event) {
        n_defensive_1.given(scope, "scope").ensureHasValue().ensureIsObject();
        n_defensive_1.given(topic, "topic").ensureHasValue().ensureIsString();
        n_defensive_1.given(event, "event").ensureHasValue().ensureIsObject();
    }
}
exports.AwsLambdaEventHandler = AwsLambdaEventHandler;
//# sourceMappingURL=aws-lambda-event-handler.js.map