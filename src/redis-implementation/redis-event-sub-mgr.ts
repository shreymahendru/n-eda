import { EventSubMgr } from "../event-sub-mgr";
import { EdaManager } from "../eda-manager";
import * as Redis from "redis";
import { given } from "@nivinjoseph/n-defensive";
import { Consumer } from "./consumer";
import { Delay, ProfilerTrace } from "@nivinjoseph/n-util";
import { ServiceLocator, inject } from "@nivinjoseph/n-ject";
import { EdaEvent } from "../eda-event";
import { ObjectDisposedException } from "@nivinjoseph/n-exception";
import { Logger } from "@nivinjoseph/n-log";

// public
@inject("RedisClient", "Logger")
export class RedisEventSubMgr implements EventSubMgr
{
    private readonly _client: Redis.RedisClient;
    // @ts-ignore
    private readonly _logger: Logger;
    private readonly _consumers = new Array<Consumer>();

    private _isDisposed = false;
    private _disposePromise: Promise<any> | null = null;
    private _manager: EdaManager = null as any;
    private _isConsuming = false;
    
    
    public constructor(redisClient: Redis.RedisClient, logger: Logger)
    {
        given(redisClient, "redisClient").ensureHasValue().ensureIsObject();
        this._client = redisClient;
        
        given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;
    }
    
    
    public initialize(manager: EdaManager): void
    {
        given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(EdaManager);
        
        if (this._isDisposed)
            throw new ObjectDisposedException(this);
        
        given(this, "this").ensure(t => !t._manager, "already initialized");

        this._manager = manager;
    }
    
    public async consume(): Promise<void>
    {
        if (this._isDisposed)
            throw new ObjectDisposedException(this);

        given(this, "this").ensure(t => !!t._manager, "not initialized");
        
        if (!this._isConsuming)
        {
            this._isConsuming = true;
            
            this._manager.topics.forEach(topic =>
            {
                if (topic.isDisabled || topic.publishOnly)
                    return;
                
                if (topic.partitionAffinity != null)
                {
                    topic.partitionAffinity.forEach(partition =>
                        this._consumers.push(new Consumer(this._client, this._manager, topic.name, partition,
                            this.onEventReceived.bind(this))));
                }
                else
                {
                    for (let partition = 0; partition < topic.numPartitions; partition++)
                    {
                        this._consumers.push(new Consumer(this._client, this._manager, topic.name, partition,
                            this.onEventReceived.bind(this)));
                    }
                }
            });

            this._consumers.forEach(t => t.consume());
        }
        
        while (!this._isDisposed)
        {
            await Delay.seconds(2);
        }
    }
    
    public async dispose(): Promise<void>
    {
        if (!this._isDisposed)
        {
            this._isDisposed = true;
            
            this._disposePromise = Promise.all(this._consumers.map(t => t.dispose()));
            
            if (this._manager.metricsEnabled)
            {
                await Delay.seconds(2);
                
                const allTraces = this._consumers.reduce((acc, t, index) =>
                {
                    if (index === 0)
                        return acc;
                    
                    acc.push(...t.profiler!.traces);
                    return acc;
                }, new Array<ProfilerTrace>());
                
                let totalEventCount = 0;
                let totalEventsProcessingTime = 0;
                let groupCount = 0;
                let totalEventAverage = 0;
                const messages = new Array<{ name: string; count: number; totalPT: number; averagePT: number; minPT: number; maxPT: number; medianPT: number}>();
                
                const groups = allTraces.groupBy(t => t.message);
                groups.forEach((group) =>
                {
                    const eventCount = group.values.length;
                    const eventsProcessingTime = group.values.reduce((acc, t) => acc + t.diffMs, 0);
                    const eventAverage = eventsProcessingTime / eventCount;
                    
                    totalEventCount += eventCount;
                    totalEventsProcessingTime += eventsProcessingTime;
                    totalEventAverage += eventAverage;
                    groupCount++;
                    
                    // messages.push(`[${group.key}]: count = ${eventCount}; total PT = ${eventsProcessingTime}; average PT = ${eventAverage}; min PT = ${Math.min(...group.values.map(t => t.diffMs))}; max PT = ${Math.max(...group.values.map(t => t.diffMs))}; median PT = ${group.values.length % 2 === 0 ? group.values.map(t => t.diffMs).orderBy()[M]}`);
                    
                    const diffs = group.values.map(t => t.diffMs).orderBy();
                    
                    messages.push({
                        name: group.key,
                        count: eventCount,
                        totalPT: eventsProcessingTime,
                        averagePT: Math.floor(eventAverage),
                        minPT: Math.min(...diffs),
                        maxPT: Math.max(...diffs),
                        medianPT: group.values.length % 2 === 0
                            ? Math.floor((diffs[(diffs.length / 2) - 1] + diffs[diffs.length / 2]) / 2)
                            : diffs[Math.floor(diffs.length / 2) - 1]
                    });
                });
                
                // const totals = this._consumers.reduce((acc, t) =>
                // {
                //     acc.eventCount += (t.profiler!.traces.length - 1);
                //     acc.eventsProcessingTime += t.profiler!.traces.reduce((acc, t) => acc + t.diffMs, 0);
                //     return acc;
                // }, { eventCount: 0, eventsProcessingTime: 0 });    
                
                console.log(`[EVENTS CONSUMER ${this._manager.consumerName ?? "UNKNOWN"}]:  Total events processed = ${totalEventCount}; Total PT = ${totalEventsProcessingTime}; Average PT = ${groupCount === 0 ? 0 : totalEventAverage / groupCount};`);
                
                // const padConstant = groups.map(t => t.key).orderByDesc(t => t.length)[0]?.length ?? 15;
                // const leftPad = (val: any) =>
                // {
                //     if (val == null)
                //         return "UNKNOWN";
                    
                //     const v = val.toString().trim() as string;
                //     if (v.length >= padConstant)
                //         return v;
                //     else
                //     {
                //         let padding = "";
                //         Make.loop((_) => padding += " ", padConstant - v.length);
                //         return padding + v;
                //     }
                // };
                
                // console.log(leftPad("name"), leftPad("count"), leftPad("totalPT"), leftPad("averagePT"), leftPad("minPT"), leftPad("maxPT"), leftPad("medianPT"));
                // messages.forEach((message) =>
                //     console.log(leftPad(message.name), leftPad(message.count), leftPad(message.totalPT), leftPad(message.averagePT), leftPad(message.minPT), leftPad(message.maxPT), leftPad(message.medianPT)));
                    
                console.table(messages);
            }
        }

        await this._disposePromise;
    }    
    
    
    protected onEventReceived(scope: ServiceLocator, topic: string, event: EdaEvent): void
    {
        given(scope, "scope").ensureHasValue().ensureIsObject();
        given(topic, "topic").ensureHasValue().ensureIsString();
        given(event, "event").ensureHasValue().ensureIsObject();
    }
}