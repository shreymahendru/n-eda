"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Topic = void 0;
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_exception_1 = require("@nivinjoseph/n-exception");
const n_util_1 = require("@nivinjoseph/n-util");
class Topic {
    constructor(name, ttlMinutes, numPartitions) {
        this._publishOnly = false;
        this._partitionAffinity = null;
        this._isDisabled = false;
        n_defensive_1.given(name, "name").ensureHasValue().ensureIsString();
        this._name = name.trim();
        n_defensive_1.given(ttlMinutes, "ttlMinutes").ensureHasValue().ensureIsNumber().ensure(t => t > 0);
        this._ttlMinutes = ttlMinutes;
        n_defensive_1.given(numPartitions, "numPartitions").ensureHasValue().ensureIsNumber().ensure(t => t > 0);
        this._numPartitions = numPartitions;
    }
    get name() { return this._name; }
    get ttlMinutes() { return this._ttlMinutes; }
    get numPartitions() { return this._numPartitions; }
    get publishOnly() { return this._publishOnly; }
    get partitionAffinity() { return this._partitionAffinity; }
    get isDisabled() { return this._isDisabled; }
    makePublishOnly() {
        this._publishOnly = true;
        return this;
    }
    configurePartitionAffinity(partitionAffinity) {
        n_defensive_1.given(partitionAffinity, "partitionAffinity").ensureHasValue().ensureIsString()
            .ensure(t => t.contains("-") && t.trim().split("-").length === 2 && t.trim().split("-")
            .every(u => n_util_1.TypeHelper.parseNumber(u) != null), "invalid format");
        const [lower, upper] = partitionAffinity.trim().split("-").map(t => Number.parseInt(t));
        if (lower < 0 || lower >= this._numPartitions || upper < 0 || upper >= this._numPartitions || upper > lower)
            throw new n_exception_1.ArgumentException("partitionAffinity", "invalid value");
        const partitions = new Array();
        for (let i = lower; i <= upper; i++)
            partitions.push(i);
        this._partitionAffinity = partitions;
        return this;
    }
    disable() {
        this._isDisabled = true;
        return this;
    }
}
exports.Topic = Topic;
//# sourceMappingURL=topic.js.map