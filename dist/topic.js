"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const n_defensive_1 = require("@nivinjoseph/n-defensive");
class Topic {
    constructor(name, numPartitions, partitionAffinity) {
        n_defensive_1.given(name, "name").ensureHasValue().ensureIsString();
        this._name = name.trim();
        n_defensive_1.given(numPartitions, "numPartitions").ensureIsNumber().ensure(t => t > 0);
        this._numPartitions = numPartitions || 1;
        n_defensive_1.given(partitionAffinity, "partitionAffinity").ensureIsNumber()
            .ensure(t => t >= 0 && t < this._numPartitions);
        this._partitionAffinity = partitionAffinity == null ? null : partitionAffinity;
    }
    get name() { return this._name; }
    get numPartitions() { return this._numPartitions; }
    get partitionAffinity() { return this._partitionAffinity; }
    get hasPartitionAffinity() { return this._partitionAffinity != null; }
}
exports.Topic = Topic;
//# sourceMappingURL=topic.js.map