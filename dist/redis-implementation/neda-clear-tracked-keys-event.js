"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NedaClearTrackedKeysEvent = void 0;
const tslib_1 = require("tslib");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_util_1 = require("@nivinjoseph/n-util");
class NedaClearTrackedKeysEvent extends n_util_1.Serializable {
    constructor(data) {
        super(data);
        const { id } = data;
        (0, n_defensive_1.given)(id, "id").ensureHasValue().ensureIsString();
        this._id = id;
    }
    get id() { return this._id; }
    get name() { return NedaClearTrackedKeysEvent.getTypeName(); }
    get partitionKey() { return this.name; }
}
tslib_1.__decorate([
    n_util_1.serialize,
    tslib_1.__metadata("design:type", String),
    tslib_1.__metadata("design:paramtypes", [])
], NedaClearTrackedKeysEvent.prototype, "id", null);
tslib_1.__decorate([
    n_util_1.serialize // has to be serialized for eda purposes
    ,
    tslib_1.__metadata("design:type", String),
    tslib_1.__metadata("design:paramtypes", [])
], NedaClearTrackedKeysEvent.prototype, "name", null);
exports.NedaClearTrackedKeysEvent = NedaClearTrackedKeysEvent;
//# sourceMappingURL=neda-clear-tracked-keys-event.js.map