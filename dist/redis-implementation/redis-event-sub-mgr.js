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
const eda_manager_1 = require("../eda-manager");
const Redis = require("redis");
const n_config_1 = require("@nivinjoseph/n-config");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const consumer_1 = require("./consumer");
const n_util_1 = require("@nivinjoseph/n-util");
class RedisEventSubMgr {
    constructor() {
        this._consumers = new Array();
        this._isDisposed = false;
        this._disposePromise = null;
        this._manager = null;
        this._client = n_config_1.ConfigurationManager.getConfig("env") === "dev"
            ? Redis.createClient() : Redis.createClient(n_config_1.ConfigurationManager.getConfig("REDIS_URL"));
    }
    initialize(manager) {
        n_defensive_1.given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager);
        n_defensive_1.given(this, "this").ensure(t => !t._manager, "already initialized");
        this._manager = manager;
        this._manager.topics.forEach(topic => {
            if (topic.partitionAffinity != null) {
                this._consumers.push(new consumer_1.Consumer(this._client, this._manager, topic.name, topic.partitionAffinity, this.onEventReceived.bind(this)));
            }
            else {
                for (let partition = 0; partition < topic.numPartitions; partition++) {
                    this._consumers.push(new consumer_1.Consumer(this._client, this._manager, topic.name, partition, this.onEventReceived.bind(this)));
                }
            }
        });
        this._consumers.forEach(t => t.consume());
    }
    wait() {
        return __awaiter(this, void 0, void 0, function* () {
            while (!this._isDisposed) {
                yield n_util_1.Delay.seconds(2);
            }
        });
    }
    dispose() {
        if (!this._isDisposed) {
            this._isDisposed = true;
            this._disposePromise = Promise.all(this._consumers.map(t => t.dispose()))
                .then(() => new Promise((resolve, _) => this._client.quit(() => resolve())));
        }
        return this._disposePromise;
    }
    onEventReceived(scope, topic, event) {
        n_defensive_1.given(scope, "scope").ensureHasValue().ensureIsObject();
        n_defensive_1.given(topic, "topic").ensureHasValue().ensureIsString();
        n_defensive_1.given(event, "event").ensureHasValue().ensureIsObject();
    }
}
exports.RedisEventSubMgr = RedisEventSubMgr;
//# sourceMappingURL=redis-event-sub-mgr.js.map