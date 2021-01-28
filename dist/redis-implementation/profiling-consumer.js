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
exports.ProfilingConsumer = void 0;
const n_exception_1 = require("@nivinjoseph/n-exception");
const n_util_1 = require("@nivinjoseph/n-util");
const consumer_1 = require("./consumer");
const consumer_profiler_1 = require("./consumer-profiler");
class ProfilingConsumer extends consumer_1.Consumer {
    constructor() {
        super(...arguments);
        this._profiler = new consumer_profiler_1.ConsumerProfiler();
    }
    get profiler() { return this._profiler; }
    beginConsume() {
        return __awaiter(this, void 0, void 0, function* () {
            while (true) {
                if (this.isDisposed)
                    return;
                try {
                    this._profiler.fetchPartitionWriteIndexStarted();
                    const writeIndex = yield this.fetchPartitionWriteIndex();
                    this._profiler.fetchPartitionWriteIndexEnded();
                    this._profiler.fetchConsumerPartitionReadIndexStarted();
                    const readIndex = yield this.fetchConsumerPartitionReadIndex();
                    this._profiler.fetchConsumerPartitionReadIndexEnded();
                    if (readIndex >= writeIndex) {
                        yield n_util_1.Delay.seconds(1);
                        continue;
                    }
                    const maxRead = 50;
                    const lowerBoundReadIndex = readIndex + 1;
                    const upperBoundReadIndex = (writeIndex - readIndex) > maxRead ? readIndex + maxRead : writeIndex;
                    this._profiler.batchRetrieveEventsStarted();
                    const eventsData = yield this.batchRetrieveEvents(lowerBoundReadIndex, upperBoundReadIndex);
                    this._profiler.batchRetrieveEventsEnded();
                    for (const item of eventsData) {
                        if (this.isDisposed)
                            return;
                        let eventData = item.value;
                        let numReadAttempts = 1;
                        const maxReadAttempts = 10;
                        while (eventData == null && numReadAttempts < maxReadAttempts) {
                            if (this.isDisposed)
                                return;
                            yield n_util_1.Delay.milliseconds(100);
                            this._profiler.retrieveEventStarted();
                            eventData = yield this.retrieveEvent(item.index);
                            this._profiler.retrieveEventEnded();
                            numReadAttempts++;
                        }
                        if (eventData == null) {
                            try {
                                throw new n_exception_1.ApplicationException(`Failed to read event data after ${maxReadAttempts} read attempts => Topic=${this.topic}; Partition=${this.partition}; ReadIndex=${item.index};`);
                            }
                            catch (error) {
                                yield this.logger.logError(error);
                            }
                            this._profiler.incrementConsumerPartitionReadIndexStarted();
                            yield this.incrementConsumerPartitionReadIndex();
                            this._profiler.incrementConsumerPartitionReadIndexEnded();
                            continue;
                        }
                        this._profiler.decompressEventStarted();
                        const event = yield this.decompressEvent(eventData);
                        this._profiler.decompressEventEnded();
                        const eventId = event.$id || event.id;
                        const eventName = event.$name || event.name;
                        const eventRegistration = this.manager.eventMap.get(eventName);
                        this._profiler.deserializeEventStarted();
                        const deserializedEvent = n_util_1.Deserializer.deserialize(event);
                        this._profiler.deserializeEventEnded();
                        if (this.trackedIdsSet.has(eventId)) {
                            this._profiler.incrementConsumerPartitionReadIndexStarted();
                            yield this.incrementConsumerPartitionReadIndex();
                            this._profiler.incrementConsumerPartitionReadIndexEnded();
                            continue;
                        }
                        let failed = false;
                        try {
                            this._profiler.eventProcessingStarted(eventName, eventId);
                            yield n_util_1.Make.retryWithExponentialBackoff(() => __awaiter(this, void 0, void 0, function* () {
                                if (this.isDisposed) {
                                    failed = true;
                                    return;
                                }
                                try {
                                    yield this.processEvent(eventName, eventRegistration, deserializedEvent);
                                }
                                catch (error) {
                                    this._profiler.eventRetried(eventName);
                                    throw error;
                                }
                            }), 5)();
                            this._profiler.eventProcessingEnded(eventName, eventId);
                        }
                        catch (error) {
                            failed = true;
                            this._profiler.eventFailed(eventName);
                            yield this.logger.logWarning(`Failed to process event of type '${eventName}' with data ${JSON.stringify(event)} after 5 attempts.`);
                            yield this.logger.logError(error);
                        }
                        finally {
                            if (failed && this.isDisposed)
                                return;
                            this.track(eventId);
                            this._profiler.incrementConsumerPartitionReadIndexStarted();
                            yield this.incrementConsumerPartitionReadIndex();
                            this._profiler.incrementConsumerPartitionReadIndexEnded();
                        }
                    }
                }
                catch (error) {
                    yield this.logger.logWarning(`Error in consumer => ConsumerGroupId: ${this.manager.consumerGroupId}; Topic: ${this.topic}; Partition: ${this.partition};`);
                    yield this.logger.logError(error);
                    if (this.isDisposed)
                        return;
                    yield n_util_1.Delay.seconds(15);
                }
            }
        });
    }
}
exports.ProfilingConsumer = ProfilingConsumer;
//# sourceMappingURL=profiling-consumer.js.map