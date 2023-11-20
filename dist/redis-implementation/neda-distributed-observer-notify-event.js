"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NedaDistributedObserverNotifyEvent = void 0;
const tslib_1 = require("tslib");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_util_1 = require("@nivinjoseph/n-util");
class NedaDistributedObserverNotifyEvent extends n_util_1.Serializable {
    constructor(data) {
        super(data);
        const { observerTypeName, observerId, observedEventId, observedEvent } = data;
        (0, n_defensive_1.given)(observerTypeName, "observerTypeName").ensureHasValue().ensureIsString();
        this._observerTypeName = observerTypeName;
        (0, n_defensive_1.given)(observerId, "observerId").ensureHasValue().ensureIsString();
        this._observerId = observerId;
        (0, n_defensive_1.given)(observedEventId, "observedEventId").ensureHasValue().ensureIsString();
        this._observedEventId = observedEventId;
        (0, n_defensive_1.given)(observedEvent, "observedEvent").ensureHasValue().ensureIsObject();
        this._observedEvent = observedEvent;
    }
    get observerTypeName() { return this._observerTypeName; }
    get observerId() { return this._observerId; }
    get observedEventId() { return this._observedEventId; }
    get observedEvent() { return this._observedEvent; }
    get id() { return `${this.observerTypeName}.${this.observerId}.${this.observedEventId}`; }
    get name() { return NedaDistributedObserverNotifyEvent.getTypeName(); }
    get partitionKey() { return this.observerId; }
    get refId() { return this.observerId; }
    get refType() { return this.observerTypeName; }
}
tslib_1.__decorate([
    n_util_1.serialize,
    tslib_1.__metadata("design:type", String),
    tslib_1.__metadata("design:paramtypes", [])
], NedaDistributedObserverNotifyEvent.prototype, "observerTypeName", null);
tslib_1.__decorate([
    n_util_1.serialize,
    tslib_1.__metadata("design:type", String),
    tslib_1.__metadata("design:paramtypes", [])
], NedaDistributedObserverNotifyEvent.prototype, "observerId", null);
tslib_1.__decorate([
    n_util_1.serialize,
    tslib_1.__metadata("design:type", String),
    tslib_1.__metadata("design:paramtypes", [])
], NedaDistributedObserverNotifyEvent.prototype, "observedEventId", null);
tslib_1.__decorate([
    n_util_1.serialize,
    tslib_1.__metadata("design:type", Object),
    tslib_1.__metadata("design:paramtypes", [])
], NedaDistributedObserverNotifyEvent.prototype, "observedEvent", null);
tslib_1.__decorate([
    n_util_1.serialize // event though it is computed, we will deliberately serialize it fo it is visible in the json
    ,
    tslib_1.__metadata("design:type", String),
    tslib_1.__metadata("design:paramtypes", [])
], NedaDistributedObserverNotifyEvent.prototype, "id", null);
tslib_1.__decorate([
    n_util_1.serialize // has to be serialized for eda purposes
    ,
    tslib_1.__metadata("design:type", String),
    tslib_1.__metadata("design:paramtypes", [])
], NedaDistributedObserverNotifyEvent.prototype, "name", null);
exports.NedaDistributedObserverNotifyEvent = NedaDistributedObserverNotifyEvent;
//# sourceMappingURL=neda-distributed-observer-notify-event.js.map