"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsumerProfiler = void 0;
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_util_1 = require("@nivinjoseph/n-util");
class ConsumerProfiler {
    constructor(isEnabled) {
        this._eventTraces = new Array();
        this._eventProcessings = {};
        this._eventRetries = {};
        this._eventFailures = {};
        this._fetchPartitionWriteIndexProfiler = null;
        this._fetchConsumerPartitionReadIndexProfiler = null;
        this._incrementConsumerPartitionReadIndexProfiler = null;
        this._retrieveEventProfiler = null;
        this._batchRetrieveEventsProfiler = null;
        this._decompressEventProfiler = null;
        this._deserializeEventProfiler = null;
        this._eventProfiler = null;
        n_defensive_1.given(isEnabled, "isEnabled").ensureHasValue().ensureIsBoolean();
        this._isEnabled = isEnabled;
    }
    fetchPartitionWriteIndexStarted() {
        if (!this._isEnabled)
            return;
        this._fetchPartitionWriteIndexProfiler = new n_util_1.Profiler();
    }
    fetchPartitionWriteIndexEnded() {
        if (!this._isEnabled)
            return;
        n_defensive_1.given(this, "this")
            .ensure(t => t._fetchPartitionWriteIndexProfiler != null);
        this._fetchPartitionWriteIndexProfiler.trace("fetchPartitionWriteIndex");
        this._eventTraces.push(this._fetchPartitionWriteIndexProfiler.traces[1]);
        this._fetchPartitionWriteIndexProfiler = null;
    }
    fetchConsumerPartitionReadIndexStarted() {
        if (!this._isEnabled)
            return;
        this._fetchConsumerPartitionReadIndexProfiler = new n_util_1.Profiler();
    }
    fetchConsumerPartitionReadIndexEnded() {
        if (!this._isEnabled)
            return;
        n_defensive_1.given(this, "this")
            .ensure(t => t._fetchConsumerPartitionReadIndexProfiler != null);
        this._fetchConsumerPartitionReadIndexProfiler.trace("fetchConsumerPartitionReadIndex");
        this._eventTraces.push(this._fetchConsumerPartitionReadIndexProfiler.traces[1]);
        this._fetchConsumerPartitionReadIndexProfiler = null;
    }
    incrementConsumerPartitionReadIndexStarted() {
        if (!this._isEnabled)
            return;
        this._incrementConsumerPartitionReadIndexProfiler = new n_util_1.Profiler();
    }
    incrementConsumerPartitionReadIndexEnded() {
        if (!this._isEnabled)
            return;
        n_defensive_1.given(this, "this")
            .ensure(t => t._incrementConsumerPartitionReadIndexProfiler != null);
        this._incrementConsumerPartitionReadIndexProfiler.trace("incrementConsumerPartitionReadIndex");
        this._eventTraces.push(this._incrementConsumerPartitionReadIndexProfiler.traces[1]);
        this._incrementConsumerPartitionReadIndexProfiler = null;
    }
    retrieveEventStarted() {
        if (!this._isEnabled)
            return;
        this._retrieveEventProfiler = new n_util_1.Profiler();
    }
    retrieveEventEnded() {
        if (!this._isEnabled)
            return;
        n_defensive_1.given(this, "this")
            .ensure(t => t._retrieveEventProfiler != null);
        this._retrieveEventProfiler.trace("retrieveEvent");
        this._eventTraces.push(this._retrieveEventProfiler.traces[1]);
        this._retrieveEventProfiler = null;
    }
    batchRetrieveEventsStarted() {
        if (!this._isEnabled)
            return;
        this._batchRetrieveEventsProfiler = new n_util_1.Profiler();
    }
    batchRetrieveEventsEnded() {
        if (!this._isEnabled)
            return;
        n_defensive_1.given(this, "this")
            .ensure(t => t._batchRetrieveEventsProfiler != null);
        this._batchRetrieveEventsProfiler.trace("batchRetrieveEvents");
        this._eventTraces.push(this._batchRetrieveEventsProfiler.traces[1]);
        this._batchRetrieveEventsProfiler = null;
    }
    decompressEventStarted() {
        if (!this._isEnabled)
            return;
        this._decompressEventProfiler = new n_util_1.Profiler();
    }
    decompressEventEnded() {
        if (!this._isEnabled)
            return;
        n_defensive_1.given(this, "this")
            .ensure(t => t._decompressEventProfiler != null);
        this._decompressEventProfiler.trace("decompressEvent");
        this._eventTraces.push(this._decompressEventProfiler.traces[1]);
        this._decompressEventProfiler = null;
    }
    deserializeEventStarted() {
        if (!this._isEnabled)
            return;
        this._deserializeEventProfiler = new n_util_1.Profiler();
    }
    deserializeEventEnded() {
        if (!this._isEnabled)
            return;
        n_defensive_1.given(this, "this")
            .ensure(t => t._deserializeEventProfiler != null);
        this._deserializeEventProfiler.trace("deserializeEvent");
        this._eventTraces.push(this._deserializeEventProfiler.traces[1]);
        this._deserializeEventProfiler = null;
    }
    eventProcessingStarted(eventName, eventId) {
        if (!this._isEnabled)
            return;
        n_defensive_1.given(eventName, "eventName").ensureHasValue().ensureIsString();
        n_defensive_1.given(eventId, "eventId").ensureHasValue().ensureIsString();
        this._eventProfiler = { name: eventName, id: eventId, profiler: new n_util_1.Profiler() };
        if (!this._eventProcessings[eventName])
            this._eventProcessings[eventName] = 0;
        this._eventProcessings[eventName]++;
    }
    eventProcessingEnded(eventName, eventId) {
        if (!this._isEnabled)
            return;
        n_defensive_1.given(eventName, "eventName").ensureHasValue().ensureIsString();
        n_defensive_1.given(eventId, "eventId").ensureHasValue().ensureIsString();
        n_defensive_1.given(this, "this")
            .ensure(t => t._eventProfiler != null && t._eventProfiler.name === eventName && t._eventProfiler.id === eventId);
        this._eventProfiler.profiler.trace(eventName);
        this._eventTraces.push(this._eventProfiler.profiler.traces[1]);
        this._eventProfiler = null;
    }
    eventRetried(eventName) {
        if (!this._isEnabled)
            return;
        n_defensive_1.given(eventName, "eventName").ensureHasValue().ensureIsString();
        if (!this._eventRetries[eventName])
            this._eventRetries[eventName] = 0;
        this._eventRetries[eventName]++;
    }
    eventFailed(eventName) {
        if (!this._isEnabled)
            return;
        n_defensive_1.given(eventName, "eventName").ensureHasValue().ensureIsString();
        if (!this._eventFailures[eventName])
            this._eventFailures[eventName] = 0;
        this._eventFailures[eventName]++;
    }
    static aggregate(consumerName, consumerProfilers) {
        n_defensive_1.given(consumerName, "consumerName").ensureHasValue().ensureIsString();
        n_defensive_1.given(consumerProfilers, "consumerProfilers").ensureHasValue().ensureIsArray().ensure(t => t.length > 0);
        const eventTraces = new Array();
        const eventProcessings = {};
        const eventRetries = {};
        const eventFailures = {};
        consumerProfilers.forEach((profiler) => {
            eventTraces.push(...profiler._eventTraces);
            Object.entries(profiler._eventProcessings).forEach((entry) => {
                const key = entry[0];
                const value = entry[1];
                if (eventProcessings[key])
                    eventProcessings[key] += value;
                else
                    eventProcessings[key] = value;
            });
            Object.entries(profiler._eventRetries).forEach((entry) => {
                const key = entry[0];
                const value = entry[1];
                if (eventRetries[key])
                    eventRetries[key] += value;
                else
                    eventRetries[key] = value;
            });
            Object.entries(profiler._eventFailures).forEach((entry) => {
                const key = entry[0];
                const value = entry[1];
                if (eventFailures[key])
                    eventFailures[key] += value;
                else
                    eventFailures[key] = value;
            });
        });
        let totalEventCount = 0;
        let totalEventsProcessingTime = 0;
        let groupCount = 0;
        let totalEventAverage = 0;
        const messages = new Array();
        eventTraces.groupBy(t => t.message)
            .forEach((group) => {
            var _a, _b, _c;
            const eventCount = group.values.length;
            const eventsProcessingTime = group.values.reduce((acc, t) => acc + t.diffMs, 0);
            const eventAverage = eventsProcessingTime / eventCount;
            totalEventCount += eventCount;
            totalEventsProcessingTime += eventsProcessingTime;
            totalEventAverage += eventAverage;
            groupCount++;
            const diffs = group.values.map(t => t.diffMs).orderBy();
            messages.push({
                name: group.key,
                procesings: (_a = eventProcessings[group.key]) !== null && _a !== void 0 ? _a : null,
                retries: (_b = eventRetries[group.key]) !== null && _b !== void 0 ? _b : null,
                failures: (_c = eventFailures[group.key]) !== null && _c !== void 0 ? _c : null,
                processed: eventCount,
                totalPT: eventsProcessingTime,
                averagePT: Math.floor(eventAverage),
                minPT: Math.min(...diffs),
                maxPT: Math.max(...diffs),
                medianPT: group.values.length % 2 === 0
                    ? Math.floor((diffs[(diffs.length / 2) - 1] + diffs[diffs.length / 2]) / 2)
                    : diffs[Math.floor(diffs.length / 2) - 1]
            });
        });
        console.log(`[${consumerName}] AGGREGATE`);
        console.table({
            consumer: consumerName,
            totalEventsProcessed: totalEventCount,
            totalPT: totalEventsProcessingTime,
            averagePT: groupCount === 0 ? 0 : Math.floor(totalEventAverage / groupCount)
        });
        console.log(`[${consumerName}] DETAILS`);
        console.table(messages.orderBy(t => t.name));
    }
}
exports.ConsumerProfiler = ConsumerProfiler;
//# sourceMappingURL=consumer-profiler.js.map