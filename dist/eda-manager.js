"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EdaManager = void 0;
const tslib_1 = require("tslib");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_ject_1 = require("@nivinjoseph/n-ject");
const n_exception_1 = require("@nivinjoseph/n-exception");
const event_registration_1 = require("./event-registration");
const MurmurHash = require("murmurhash3js");
const aws_lambda_event_handler_1 = require("./redis-implementation/aws-lambda-event-handler");
const rpc_event_handler_1 = require("./redis-implementation/rpc-event-handler");
const grpc_event_handler_1 = require("./redis-implementation/grpc-event-handler");
// public
class EdaManager {
    // public get metricsEnabled(): boolean { return this._metricsEnabled; }
    constructor(container) {
        // private readonly _wildKeys: Array<string>;
        // private _metricsEnabled = false;
        this._partitionKeyMapper = null;
        this._eventBusRegistered = false;
        this._eventSubMgrRegistered = false;
        this._evtSubMgr = null;
        this._consumerName = "UNNAMED";
        this._consumerGroupId = null;
        this._cleanKeys = false;
        this._eventHandlerTracer = null;
        this._awsLambdaDetails = null;
        this._isAwsLambdaConsumer = false;
        this._awsLambdaEventHandler = null;
        this._rpcDetails = null;
        this._isRpcConsumer = false;
        this._rpcEventHandler = null;
        this._grpcDetails = null;
        this._isGrpcConsumer = false;
        this._grpcEventHandler = null;
        this._isDisposed = false;
        this._disposePromise = null;
        this._isBootstrapped = false;
        (0, n_defensive_1.given)(container, "container").ensureIsObject().ensureIsType(n_ject_1.Container);
        if (container == null) {
            this._container = new n_ject_1.Container();
            this._ownsContainer = true;
        }
        else {
            this._container = container;
            this._ownsContainer = false;
        }
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
    get eventHandlerTracer() { return this._eventHandlerTracer; }
    get awsLambdaDetails() { return this._awsLambdaDetails; }
    get awsLambdaProxyEnabled() { return this._awsLambdaDetails != null; }
    get isAwsLambdaConsumer() { return this._isAwsLambdaConsumer; }
    get rpcDetails() { return this._rpcDetails; }
    get rpcProxyEnabled() { return this._rpcDetails != null; }
    get isRpcConsumer() { return this._isRpcConsumer; }
    get grpcDetails() { return this._grpcDetails; }
    get grpcProxyEnabled() { return this._grpcDetails != null; }
    get isGrpcConsumer() { return this._isGrpcConsumer; }
    get partitionKeyMapper() { return this._partitionKeyMapper; }
    useInstaller(installer) {
        (0, n_defensive_1.given)(installer, "installer").ensureHasValue().ensureIsObject();
        (0, n_defensive_1.given)(this, "this").ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._container.install(installer);
        return this;
    }
    useConsumerName(name) {
        (0, n_defensive_1.given)(name, "name").ensureHasValue().ensureIsString();
        (0, n_defensive_1.given)(this, "this").ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._consumerName = name;
        return this;
    }
    registerTopics(...topics) {
        (0, n_defensive_1.given)(topics, "topics").ensureHasValue().ensureIsArray();
        (0, n_defensive_1.given)(this, "this").ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        for (const topic of topics) {
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
        (0, n_defensive_1.given)(func, "func").ensureHasValue().ensureIsFunction();
        (0, n_defensive_1.given)(this, "this")
            .ensure(t => !t._partitionKeyMapper, "partition key mapper already set")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._partitionKeyMapper = func;
        return this;
    }
    registerEventHandlers(...eventHandlerClasses) {
        (0, n_defensive_1.given)(eventHandlerClasses, "eventHandlerClasses").ensureHasValue().ensureIsArray();
        (0, n_defensive_1.given)(this, "this").ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        for (const eventHandler of eventHandlerClasses) {
            const eventRegistration = new event_registration_1.EventRegistration(eventHandler);
            if (this._eventMap.has(eventRegistration.eventTypeName))
                throw new n_exception_1.ApplicationException(`Multiple handlers detected for event '${eventRegistration.eventTypeName}'.`);
            this._eventMap.set(eventRegistration.eventTypeName, eventRegistration);
            this._container.registerScoped(eventRegistration.eventHandlerTypeName, eventRegistration.eventHandlerType);
        }
        return this;
    }
    registerEventHandlerTracer(tracer) {
        (0, n_defensive_1.given)(tracer, "tracer").ensureHasValue().ensureIsFunction();
        (0, n_defensive_1.given)(this, "this")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap")
            .ensure(t => !t._eventHandlerTracer, "event handler tracer already set");
        this._eventHandlerTracer = tracer;
        return this;
    }
    registerEventBus(eventBus) {
        (0, n_defensive_1.given)(eventBus, "eventBus").ensureHasValue();
        (0, n_defensive_1.given)(this, "this")
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
        (0, n_defensive_1.given)(eventSubMgr, "eventSubMgr").ensureHasValue();
        (0, n_defensive_1.given)(consumerGroupId, "consumerGroupId").ensureHasValue().ensureIsString();
        (0, n_defensive_1.given)(this, "this")
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
        (0, n_defensive_1.given)(this, "this")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._cleanKeys = true;
        return this;
    }
    proxyToAwsLambda(lambdaDetails) {
        (0, n_defensive_1.given)(lambdaDetails, "lambdaDetails").ensureHasValue().ensureIsObject();
        (0, n_defensive_1.given)(this, "this")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._awsLambdaDetails = lambdaDetails;
        return this;
    }
    actAsAwsLambdaConsumer(handler) {
        (0, n_defensive_1.given)(handler, "handler").ensureHasValue().ensureIsObject().ensureIsInstanceOf(aws_lambda_event_handler_1.AwsLambdaEventHandler);
        (0, n_defensive_1.given)(this, "this")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._awsLambdaEventHandler = handler;
        this._isAwsLambdaConsumer = true;
        return this;
    }
    proxyToRpc(rpcDetails) {
        (0, n_defensive_1.given)(rpcDetails, "rpcDetails").ensureHasValue().ensureIsObject();
        (0, n_defensive_1.given)(this, "this")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._rpcDetails = rpcDetails;
        return this;
    }
    actAsRpcConsumer(handler) {
        (0, n_defensive_1.given)(handler, "handler").ensureHasValue().ensureIsObject().ensureIsInstanceOf(rpc_event_handler_1.RpcEventHandler);
        (0, n_defensive_1.given)(this, "this")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._rpcEventHandler = handler;
        this._isRpcConsumer = true;
        return this;
    }
    proxyToGrpc(grpcDetails) {
        (0, n_defensive_1.given)(grpcDetails, "grpcDetails").ensureHasValue().ensureIsObject();
        (0, n_defensive_1.given)(this, "this")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._grpcDetails = grpcDetails;
        return this;
    }
    actAsGrpcConsumer(handler) {
        (0, n_defensive_1.given)(handler, "handler").ensureHasValue().ensureIsObject().ensureIsInstanceOf(grpc_event_handler_1.GrpcEventHandler);
        (0, n_defensive_1.given)(this, "this")
            .ensure(t => !t._isBootstrapped, "invoking method after bootstrap");
        this._grpcEventHandler = handler;
        this._isGrpcConsumer = true;
        return this;
    }
    bootstrap() {
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException(this);
        (0, n_defensive_1.given)(this, "this")
            .ensure(t => !t._isBootstrapped, "bootstrapping more than once")
            .ensure(t => t._topics.length > 0, "no topics registered")
            // .ensure(t => !!t._partitionKeyMapper, "no partition key mapper set")
            .ensure(t => t._eventBusRegistered, "no event bus registered")
            .ensure(t => !(t._eventSubMgrRegistered && t._isAwsLambdaConsumer), "cannot be both event subscriber and lambda consumer")
            .ensure(t => !(t._eventSubMgrRegistered && t._isRpcConsumer), "cannot be both event subscriber and rpc consumer")
            .ensure(t => !(t._isAwsLambdaConsumer && t._isRpcConsumer), "cannot be both lambda consumer and rpc consumer");
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (this._partitionKeyMapper == null)
            this._partitionKeyMapper = (edaEvent) => edaEvent.partitionKey;
        this._topics.map(t => this._topicMap.set(t.name, t));
        if (this._ownsContainer)
            this._container.bootstrap();
        this._container.resolve(EdaManager.eventBusKey).initialize(this);
        if (this._eventSubMgrRegistered)
            this._container.resolve(EdaManager.eventSubMgrKey).initialize(this);
        if (this._isAwsLambdaConsumer)
            this._awsLambdaEventHandler.initialize(this);
        if (this._isRpcConsumer)
            this._rpcEventHandler.initialize(this);
        if (this._isGrpcConsumer)
            this._grpcEventHandler.initialize(this);
        this._isBootstrapped = true;
    }
    beginConsumption() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this._isDisposed)
                throw new n_exception_1.ObjectDisposedException(this);
            (0, n_defensive_1.given)(this, "this")
                .ensure(t => t._isBootstrapped, "not bootstrapped")
                .ensure(t => t._eventSubMgrRegistered, "no EventSubMgr registered");
            this._evtSubMgr = this.serviceLocator.resolve(EdaManager.eventSubMgrKey);
            yield this._evtSubMgr.consume();
        });
    }
    mapToPartition(topic, event) {
        (0, n_defensive_1.given)(topic, "topic").ensureHasValue().ensureIsString()
            .ensure(t => this._topicMap.has(t));
        (0, n_defensive_1.given)(event, "event").ensureHasValue().ensureIsObject();
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException(this);
        (0, n_defensive_1.given)(this, "this")
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
        if (!this._isDisposed) {
            this._isDisposed = true;
            if (this._evtSubMgr != null)
                this._disposePromise = this._evtSubMgr.dispose().then(() => this._container.dispose());
            else
                this._disposePromise = this._container.dispose();
        }
        return this._disposePromise;
    }
}
exports.EdaManager = EdaManager;
//# sourceMappingURL=eda-manager.js.map