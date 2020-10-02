"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Topic = void 0;
const n_defensive_1 = require("@nivinjoseph/n-defensive");
class Topic {
    constructor(name, ttlMinutes, numPartitions, partitionAffinity) {
        n_defensive_1.given(name, "name").ensureHasValue().ensureIsString();
        this._name = name.trim();
        n_defensive_1.given(ttlMinutes, "ttlMinutes").ensureHasValue().ensureIsNumber().ensure(t => t > 0);
        this._ttlMinutes = ttlMinutes;
        n_defensive_1.given(numPartitions, "numPartitions").ensureHasValue().ensureIsNumber().ensure(t => t > 0);
        this._numPartitions = numPartitions;
        n_defensive_1.given(partitionAffinity, "partitionAffinity").ensureIsArray()
            .ensure(t => t.isNotEmpty)
            .ensure(t => t.every(item => item >= 0 && item < this._numPartitions));
        this._partitionAffinity = partitionAffinity == null ? null : partitionAffinity;
    }
    get name() { return this._name; }
    get ttlMinutes() { return this._ttlMinutes; }
    get numPartitions() { return this._numPartitions; }
    get partitionAffinity() { return this._partitionAffinity; }
    get hasPartitionAffinity() { return this._partitionAffinity != null; }
}
exports.Topic = Topic;
//# sourceMappingURL=topic.js.map