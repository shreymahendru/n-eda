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
exports.EdaManager = void 0;
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_ject_1 = require("@nivinjoseph/n-ject");
const n_exception_1 = require("@nivinjoseph/n-exception");
const event_registration_1 = require("./event-registration");
const MurmurHash = require("murmurhash3js");
const aws_lambda_event_handler_1 = require("./redis-implementation/aws-lambda-event-handler");
// public
class EdaManager {
    // public get metricsEnabled(): boolean { return this._metricsEnabled; }
    constructor(container) {
        // private readonly _wildKeys: Array<string>;
        // private _metricsEnabled = false;
        this._partitionKeyMapper = null;
        this._eventBusRegistered = false;
        this._eventSubMgrRegistered = false;
        this._consumerName = "UNNAMED";
        this._consumerGroupId = null;
        this._cleanKeys = false;
        this._awsLambdaDetails = null;
        this._isAwsLambdaConsumer = false;
        this._awsLambdaEventHandler = null;
        this._isDisposed = false;
        this._isBootstrapped = false;
        n_defensive_1.given(container, "container").ensureIsObject().ensureIsType(n_ject_1.Container);
        this._container = container !== null && container !== void 0 ? container : new n_ject_1.Container();
        this._topics = new Array();
        this._topicMap = new Map();
        this._eventMap = new Map();
        // this._wildKeys = new Array<string>();
    }
    static get eventBusKey() { return "EventBus"; }
    static get eventSubMgrKey() { return "EventSubMgr"; }
    get containerRegistry() { return this._container; }
    get serviceLocator() { return this._container; }
    get topics() { return this._topics; }
    get eventMap() { return this._eventMap; }
    get consumerName() { return this._consumerName; }
    get consumerGroupId() { return this._consumerGroupId; }
    get cleanKeys() { return this._cleanKeys; }
    get awsLambdaDetails() { return this._awsLambdaDetails; }
    get awsLambdaProxyEnabled() { return this._awsLambdaDetails != null; }
    get isAwsLambdaConsumer() { return this._isAwsLambdaConsumer; }
    get partitionKeyMapper() { return this._partitionKeyMapper; }
    useInstaller(installer) {
        n_defensive_1.given(installer, "installer").ensureHasValue().ensureIsObject();
        n_defensive_1.given(this, "this").ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._container.install(installer);
        return this;
    }
    useConsumerName(name) {
        n_defensive_1.given(name, "name").ensureHasValue().ensureIsString();
        n_defensive_1.given(this, "this").ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._consumerName = name;
        return this;
    }
    registerTopics(...topics) {
        n_defensive_1.given(topics, "topics").ensureHasValue().ensureIsArray();
        n_defensive_1.given(this, "this").ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        for (let topic of topics) {
            const name = topic.name.toLowerCase();
            if (this._topics.some(t => t.name.toLowerCase() === name))
                throw new n_exception_1.ApplicationException(`Multiple topics with the name '${name}' detected.`);
            this._topics.push(topic);
        }
        return this;
    }
    // public enableMetrics(): this
    // {
    //     given(this, "this").ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
    //     this._metricsEnabled = true;
    //     return this;
    // }
    usePartitionKeyMapper(func) {
        n_defensive_1.given(func, "func").ensureHasValue().ensureIsFunction();
        n_defensive_1.given(this, "this")
            .ensure(t => !t._partitionKeyMapper, "partition key mapper already set")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._partitionKeyMapper = func;
        return this;
    }
    registerEventHandlers(...eventHandlerClasses) {
        n_defensive_1.given(eventHandlerClasses, "eventHandlerClasses").ensureHasValue().ensureIsArray();
        n_defensive_1.given(this, "this").ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        for (let eventHandler of eventHandlerClasses) {
            const eventRegistration = new event_registration_1.EventRegistration(eventHandler);
            if (this._eventMap.has(eventRegistration.eventTypeName))
                throw new n_exception_1.ApplicationException(`Multiple handlers detected for event '${eventRegistration.eventTypeName}'.`);
            this._eventMap.set(eventRegistration.eventTypeName, eventRegistration);
        }
        return this;
    }
    registerEventBus(eventBus) {
        n_defensive_1.given(eventBus, "eventBus").ensureHasValue().ensure(t => typeof t === "function" || typeof t === "object");
        n_defensive_1.given(this, "this")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap")
            .ensure(t => !t._eventBusRegistered, "event bus already registered");
        if (typeof eventBus === "function")
            this._container.registerSingleton(EdaManager.eventBusKey, eventBus);
        else
            this._container.registerInstance(EdaManager.eventBusKey, eventBus);
        this._eventBusRegistered = true;
        return this;
    }
    registerEventSubscriptionManager(eventSubMgr, consumerGroupId) {
        n_defensive_1.given(eventSubMgr, "eventSubMgr").ensureHasValue().ensure(t => typeof t === "function" || typeof t === "object");
        n_defensive_1.given(consumerGroupId, "consumerGroupId").ensureHasValue().ensureIsString();
        n_defensive_1.given(this, "this")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap")
            .ensure(t => !t._eventSubMgrRegistered, "event subscription manager already registered");
        if (typeof eventSubMgr === "function")
            this._container.registerSingleton(EdaManager.eventSubMgrKey, eventSubMgr);
        else
            this._container.registerInstance(EdaManager.eventSubMgrKey, eventSubMgr);
        this._consumerGroupId = consumerGroupId.trim();
        this._eventSubMgrRegistered = true;
        return this;
    }
    cleanUpKeys() {
        n_defensive_1.given(this, "this")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._cleanKeys = true;
        return this;
    }
    proxyToAwsLambda(lambdaDetails) {
        n_defensive_1.given(lambdaDetails, "lambdaDetails").ensureHasValue().ensureIsObject();
        n_defensive_1.given(this, "this")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._awsLambdaDetails = lambdaDetails;
        return this;
    }
    actAsAwsLambdaConsumer(handler) {
        n_defensive_1.given(handler, "handler").ensureHasValue().ensureIsObject().ensureIsInstanceOf(aws_lambda_event_handler_1.AwsLambdaEventHandler);
        n_defensive_1.given(this, "this")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._awsLambdaEventHandler = handler;
        this._isAwsLambdaConsumer = true;
        return this;
    }
    bootstrap() {
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException(this);
        n_defensive_1.given(this, "this")
            .ensure(t => !t._isBootstrapped, "bootstrapping more than once")
            .ensure(t => t._topics.length > 0, "no topics registered")
            .ensure(t => !!t._partitionKeyMapper, "no partition key mapper set")
            .ensure(t => t._eventBusRegistered, "no event bus registered")
            .ensure(t => !(t._eventSubMgrRegistered && t._isAwsLambdaConsumer), "cannot be both event subscriber and lambda consumer");
        this._topics.map(t => this._topicMap.set(t.name, t));
        this._eventMap.forEach(t => this._container.registerScoped(t.eventHandlerTypeName, t.eventHandlerType));
        this._container.bootstrap();
        this._container.resolve(EdaManager.eventBusKey).initialize(this);
        if (this._eventSubMgrRegistered)
            this._container.resolve(EdaManager.eventSubMgrKey)
                .initialize(this);
        if (this._isAwsLambdaConsumer)
            this._awsLambdaEventHandler.initialize(this);
        this._isBootstrapped = true;
    }
    beginConsumption() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._isDisposed)
                throw new n_exception_1.ObjectDisposedException(this);
            n_defensive_1.given(this, "this")
                .ensure(t => t._isBootstrapped, "not bootstrapped")
                .ensure(t => t._eventSubMgrRegistered, "no EventSubMgr registered");
            const eventSubMgr = this.serviceLocator.resolve(EdaManager.eventSubMgrKey);
            yield eventSubMgr.consume();
        });
    }
    mapToPartition(topic, event) {
        n_defensive_1.given(topic, "topic").ensureHasValue().ensureIsString()
            .ensure(t => this._topicMap.has(t));
        n_defensive_1.given(event, "event").ensureHasValue().ensureIsObject();
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException(this);
        n_defensive_1.given(this, "this")
            .ensure(t => t._isBootstrapped, "not bootstrapped");
        const partitionKey = this._partitionKeyMapper(event).trim();
        return MurmurHash.x86.hash32(partitionKey) % this._topicMap.get(topic).numPartitions;
    }
    // public getEventRegistration(event: EdaEvent): EventRegistration | false
    // {
    //     let eventRegistration: EventRegistration | null = null;
    //     if (this._eventMap.has(event.name))
    //         eventRegistration = this._eventMap.get(event.name) as EventRegistration;
    //     else
    //     {
    //         const wildKey = this._wildKeys.find(t => event.name.startsWith(t));
    //         if (wildKey)
    //             eventRegistration = this._eventMap.get(wildKey) as EventRegistration;
    //     }
    //     return eventRegistration || false;
    // }
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._isDisposed)
                return;
            this._isDisposed = true;
            yield this._container.dispose();
        });
    }
}
exports.EdaManager = EdaManager;
//# sourceMappingURL=eda-manager.js.map