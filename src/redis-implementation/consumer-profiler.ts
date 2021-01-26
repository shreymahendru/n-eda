import { given } from "@nivinjoseph/n-defensive";
import { ProfilerTrace, Profiler } from "@nivinjoseph/n-util";


export class ConsumerProfiler
{
    private readonly _isEnabled: boolean;
    
    private readonly _eventTraces = new Array<ProfilerTrace>();
    private readonly _eventProcessings: { [name: string]: number; } = {};
    private readonly _eventRetries: { [name: string]: number; } = {};
    private readonly _eventFailures: { [name: string]: number; } = {};

    private _fetchPartitionWriteIndexProfiler: Profiler | null = null;
    private _fetchConsumerPartitionReadIndexProfiler: Profiler | null = null;
    private _incrementConsumerPartitionReadIndexProfiler: Profiler | null = null;
    private _retrieveEventProfiler: Profiler | null = null;
    private _batchRetrieveEventsProfiler: Profiler | null = null;
    private _decompressEventProfiler: Profiler | null = null;
    private _deserializeEventProfiler: Profiler | null = null;
    private _eventProfiler: { name: string; id: string; profiler: Profiler } | null = null;


    public constructor(isEnabled: boolean)
    {
        given(isEnabled, "isEnabled").ensureHasValue().ensureIsBoolean();
        this._isEnabled = isEnabled;
    }


    public fetchPartitionWriteIndexStarted(): void
    {
        if (!this._isEnabled)
            return;

        this._fetchPartitionWriteIndexProfiler = new Profiler();
    }

    public fetchPartitionWriteIndexEnded(): void
    {
        if (!this._isEnabled)
            return;

        given(this, "this")
            .ensure(t => t._fetchPartitionWriteIndexProfiler != null);

        this._fetchPartitionWriteIndexProfiler!.trace("fetchPartitionWriteIndex");
        this._eventTraces.push(this._fetchPartitionWriteIndexProfiler!.traces[1]);
        this._fetchPartitionWriteIndexProfiler = null;
    }

    public fetchConsumerPartitionReadIndexStarted(): void
    {
        if (!this._isEnabled)
            return;

        this._fetchConsumerPartitionReadIndexProfiler = new Profiler();
    }

    public fetchConsumerPartitionReadIndexEnded(): void
    {
        if (!this._isEnabled)
            return;

        given(this, "this")
            .ensure(t => t._fetchConsumerPartitionReadIndexProfiler != null);

        this._fetchConsumerPartitionReadIndexProfiler!.trace("fetchConsumerPartitionReadIndex");
        this._eventTraces.push(this._fetchConsumerPartitionReadIndexProfiler!.traces[1]);
        this._fetchConsumerPartitionReadIndexProfiler = null;
    }

    public incrementConsumerPartitionReadIndexStarted(): void
    {
        if (!this._isEnabled)
            return;

        this._incrementConsumerPartitionReadIndexProfiler = new Profiler();
    }

    public incrementConsumerPartitionReadIndexEnded(): void
    {
        if (!this._isEnabled)
            return;

        given(this, "this")
            .ensure(t => t._incrementConsumerPartitionReadIndexProfiler != null);

        this._incrementConsumerPartitionReadIndexProfiler!.trace("incrementConsumerPartitionReadIndex");
        this._eventTraces.push(this._incrementConsumerPartitionReadIndexProfiler!.traces[1]);
        this._incrementConsumerPartitionReadIndexProfiler = null;
    }

    public retrieveEventStarted(): void
    {
        if (!this._isEnabled)
            return;

        this._retrieveEventProfiler = new Profiler();
    }

    public retrieveEventEnded(): void
    {
        if (!this._isEnabled)
            return;

        given(this, "this")
            .ensure(t => t._retrieveEventProfiler != null);

        this._retrieveEventProfiler!.trace("retrieveEvent");
        this._eventTraces.push(this._retrieveEventProfiler!.traces[1]);
        this._retrieveEventProfiler = null;
    }

    public batchRetrieveEventsStarted(): void
    {
        if (!this._isEnabled)
            return;

        this._batchRetrieveEventsProfiler = new Profiler();
    }

    public batchRetrieveEventsEnded(): void
    {
        if (!this._isEnabled)
            return;

        given(this, "this")
            .ensure(t => t._batchRetrieveEventsProfiler != null);

        this._batchRetrieveEventsProfiler!.trace("batchRetrieveEvents");
        this._eventTraces.push(this._batchRetrieveEventsProfiler!.traces[1]);
        this._batchRetrieveEventsProfiler = null;
    }
    
    public decompressEventStarted(): void
    {
        if (!this._isEnabled)
            return;

        this._decompressEventProfiler = new Profiler();
    }
    
    public decompressEventEnded(): void
    {
        if (!this._isEnabled)
            return;

        given(this, "this")
            .ensure(t => t._decompressEventProfiler != null);

        this._decompressEventProfiler!.trace("decompressEvent");
        this._eventTraces.push(this._decompressEventProfiler!.traces[1]);
        this._decompressEventProfiler = null;
    }
    
    public deserializeEventStarted(): void
    {
        if (!this._isEnabled)
            return;

        this._deserializeEventProfiler = new Profiler();
    }

    public deserializeEventEnded(): void
    {
        if (!this._isEnabled)
            return;

        given(this, "this")
            .ensure(t => t._deserializeEventProfiler != null);

        this._deserializeEventProfiler!.trace("deserializeEvent");
        this._eventTraces.push(this._deserializeEventProfiler!.traces[1]);
        this._deserializeEventProfiler = null;
    }

    public eventProcessingStarted(eventName: string, eventId: string): void
    {
        if (!this._isEnabled)
            return;

        given(eventName, "eventName").ensureHasValue().ensureIsString();
        given(eventId, "eventId").ensureHasValue().ensureIsString();

        this._eventProfiler = { name: eventName, id: eventId, profiler: new Profiler() };

        if (!this._eventProcessings[eventName])
            this._eventProcessings[eventName] = 0;

        this._eventProcessings[eventName]++;
    }

    public eventProcessingEnded(eventName: string, eventId: string): void
    {
        if (!this._isEnabled)
            return;

        given(eventName, "eventName").ensureHasValue().ensureIsString();
        given(eventId, "eventId").ensureHasValue().ensureIsString();
        given(this, "this")
            .ensure(t => t._eventProfiler != null && t._eventProfiler.name === eventName && t._eventProfiler.id === eventId);

        this._eventProfiler!.profiler.trace(eventName);
        this._eventTraces.push(this._eventProfiler!.profiler.traces[1]);
        this._eventProfiler = null;
    }

    public eventRetried(eventName: string): void
    {
        if (!this._isEnabled)
            return;

        given(eventName, "eventName").ensureHasValue().ensureIsString();

        if (!this._eventRetries[eventName])
            this._eventRetries[eventName] = 0;

        this._eventRetries[eventName]++;
    }

    public eventFailed(eventName: string): void
    {
        if (!this._isEnabled)
            return;

        given(eventName, "eventName").ensureHasValue().ensureIsString();

        if (!this._eventFailures[eventName])
            this._eventFailures[eventName] = 0;

        this._eventFailures[eventName]++;
    }
    
    
    public static aggregate(consumerName: string , consumerProfilers: ReadonlyArray<ConsumerProfiler>): void
    {
        given(consumerName, "consumerName").ensureHasValue().ensureIsString();
        given(consumerProfilers, "consumerProfilers").ensureHasValue().ensureIsArray().ensure(t => t.length > 0);
        
        const eventTraces = new Array<ProfilerTrace>();
        const eventProcessings: { [name: string]: number; } = { };
        const eventRetries: { [name: string]: number; } = { };
        const eventFailures: { [name: string]: number; } = {};
        
        consumerProfilers.forEach((profiler) =>
        {
            eventTraces.push(...profiler._eventTraces);
            
            Object.entries(profiler._eventProcessings).forEach((entry) =>
            {
                const key = entry[0];
                const value = entry[1];
                
                if (eventProcessings[key])
                    eventProcessings[key] += value;
                else
                    eventProcessings[key] = value;
            });
            
            Object.entries(profiler._eventRetries).forEach((entry) =>
            {
                const key = entry[0];
                const value = entry[1];

                if (eventRetries[key])
                    eventRetries[key] += value;
                else
                    eventRetries[key] = value;
            });
            
            Object.entries(profiler._eventFailures).forEach((entry) =>
            {
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
        const messages = new Array<any>();
        
        eventTraces.groupBy(t => t.message)
            .forEach((group) =>
            {
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
                    procesings: eventProcessings[group.key] ?? null,
                    retries: eventRetries[group.key] ?? null,
                    failures: eventFailures[group.key] ?? null,
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
        
        // console.log(`[EVENTS CONSUMER ${consumerName}]:  Total events processed = ${totalEventCount}; Total PT = ${totalEventsProcessingTime}; Average PT = ${groupCount === 0 ? 0 : Math.floor(totalEventAverage / groupCount)};`);
        
        console.log(`[${consumerName}] AGGREGATE`);
        console.table({
            consumer: consumerName,
            totalEventsProcessed: totalEventCount,
            totalPT: totalEventsProcessingTime,
            averagePT: groupCount === 0 ? 0 : Math.floor(totalEventAverage / groupCount)
        });
        
        // console.log("EVENT PROCESSINGS");
        // console.table(Object.entries(eventProcessings).map(t => ({ name: t[0], count: t[1] })).orderBy(t => t.name));
        
        // console.log("EVENT RETRIES");
        // console.table(Object.entries(eventRetries).map(t => ({ name: t[0], count: t[1] })).orderBy(t => t.name));
        
        // console.log("EVENT FAILURES");
        // console.table(Object.entries(eventFailures).map(t => ({ name: t[0], count: t[1] })).orderBy(t => t.name));
        
        console.log(`[${consumerName}] DETAILS`);
        console.table(messages.orderBy(t => t.name));
    }
}