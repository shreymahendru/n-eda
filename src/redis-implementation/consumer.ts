import { Disposable, Delay, Make, Deserializer, Profiler } from "@nivinjoseph/n-util";
import { given } from "@nivinjoseph/n-defensive";
import * as Redis from "redis";
import { EdaManager } from "../eda-manager";
import { EventRegistration } from "../event-registration";
import { EdaEventHandler } from "../eda-event-handler";
import { EdaEvent } from "../eda-event";
import { ServiceLocator } from "@nivinjoseph/n-ject";
import { Logger } from "@nivinjoseph/n-log";
import { ObjectDisposedException, ApplicationException } from "@nivinjoseph/n-exception";
import * as Zlib from "zlib";


export class Consumer implements Disposable
{
    private readonly _edaPrefix = "n-eda";
    private readonly _client: Redis.RedisClient;
    private readonly _manager: EdaManager;
    private readonly _logger: Logger;
    private readonly _topic: string;
    private readonly _partition: number;
    private readonly _onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void;
    
    private _eventCount = 0;
    private _eventsProcessingTime = 0;
    private _isDisposed = false;
    private _trackedIds = new Array<string>();
    private _consumePromise: Promise<void> | null = null;
    
    
    public get eventCount(): number { return this._eventCount; }
    public get eventsProcessingTime(): number { return this._eventsProcessingTime; }
    
    
    public constructor(client: Redis.RedisClient, manager: EdaManager, topic: string, partition: number,
        onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void)
    {
        given(client, "client").ensureHasValue().ensureIsObject();
        this._client = client;
        
        given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(EdaManager);
        this._manager = manager;
        
        this._logger = this._manager.serviceLocator.resolve<Logger>("Logger");
        
        given(topic, "topic").ensureHasValue().ensureIsString();
        this._topic = topic;
        
        given(partition, "partition").ensureHasValue().ensureIsNumber();
        this._partition = partition;
        
        given(onEventReceived, "onEventReceived").ensureHasValue().ensureIsFunction();
        this._onEventReceived = onEventReceived;
    }
    
    
    public consume(): void
    {
        if (this._isDisposed)
            throw new ObjectDisposedException(this);
        
        given(this, "this").ensure(t => !t._consumePromise, "consumption has already commenced");
        
        this._consumePromise = this.beginConsume();
    }
    
    public dispose(): Promise<void>
    {
        if (!this._isDisposed)
            this._isDisposed = true;
        
        return this._consumePromise || Promise.resolve();
    }
    
    private async beginConsume(): Promise<void>
    {
        while (true)
        {
            if (this._isDisposed)
                return;

            try 
            {
                const writeIndex = await this.getPartitionWriteIndex();
                const readIndex = await this.getConsumerPartitionReadIndex();

                if (readIndex >= writeIndex)
                {
                    await Delay.seconds(1);
                    continue;
                }

                // const indexToRead = readIndex + 1;
                const maxRead = 50;
                const lowerBoundReadIndex = readIndex + 1;
                const upperBoundReadIndex = (writeIndex - readIndex) > maxRead ? readIndex + maxRead : writeIndex;
                
                const eventsData = await this.retrieveEvents(lowerBoundReadIndex, upperBoundReadIndex);
                for (const item of eventsData)
                {
                    if (this._isDisposed)
                        return;
                    
                    const profiler = this._manager.metricsEnabled ? new Profiler() : null;
                    
                    let eventData = item.value;
                    let numReadAttempts = 1;
                    const maxReadAttempts = 10;
                    while (eventData == null && numReadAttempts < maxReadAttempts) // we need to do this to deal with race condition
                    {
                        if (this._isDisposed)
                            return;
                        
                        await Delay.milliseconds(500);
                        eventData = await this.retrieveEvent(item.index);
                        numReadAttempts++;
                    }

                    if (eventData == null)
                    {
                        try 
                        {
                            throw new ApplicationException(`Failed to read event data after ${maxReadAttempts} read attempts => Topic=${this._topic}; Partition=${this._partition}; ReadIndex=${item.index};`);
                        }
                        catch (error)
                        {
                            await this._logger.logError(error);
                        }

                        await this.incrementConsumerPartitionReadIndex();
                        continue;
                    }

                    const event = await this.decompressEvent(eventData);
                    const eventId = (<any>event).$id || (<any>event).id; // for compatibility with n-domain DomainEvent
                    const eventName = (<any>event).$name || (<any>event).name; // for compatibility with n-domain DomainEvent
                    const eventRegistration = this._manager.eventMap.get(eventName) as EventRegistration;
                    // const deserializedEvent = (<any>eventRegistration.eventType).deserializeEvent(event);
                    const deserializedEvent = Deserializer.deserialize(event);

                    if (this._trackedIds.contains(eventId))
                    {
                        await this.incrementConsumerPartitionReadIndex();
                        continue;
                    }

                    let failed = false;
                    try 
                    {
                        await Make.retryWithExponentialBackoff(async () =>
                        {
                            if (this._isDisposed)
                            {
                                failed = true;
                                return;
                            }
                            await this.processEvent(eventName, eventRegistration, deserializedEvent);
                        }, 5)();
                    }
                    catch (error)
                    {
                        failed = true;
                        await this._logger.logWarning(`Failed to process event of type '${eventName}' with data ${JSON.stringify(event)} after 5 attempts.`);
                        await this._logger.logError(error);
                    }
                    finally
                    {
                        if (failed && this._isDisposed)
                            return;
                        
                        this.track(eventId);
                        await this.incrementConsumerPartitionReadIndex();
                        
                        if (profiler)
                        {
                            this._eventCount++;
                            profiler.trace("Event processed");
                            this._eventsProcessingTime += profiler.traces[1].diffMs;
                        }
                    }
                }
            }
            catch (error)
            {
                await this._logger.logWarning(`Error in consumer => ConsumerGroupId: ${this._manager.consumerGroupId}; Topic: ${this._topic}; Partition: ${this._partition};`);
                await this._logger.logError(error);
                if (this._isDisposed)
                    return;
                await Delay.minutes(1);
            }
        }
    }
    
    private getPartitionWriteIndex(): Promise<number>
    {
        const key = `${this._edaPrefix}-${this._topic}-${this._partition}-write-index`;
        
        return new Promise((resolve, reject) =>
        {
            this._client.get(key, (err, value) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                resolve(value != null ? JSON.parse(value) : 0);
            });
        });
    }
    
    private getConsumerPartitionReadIndex(): Promise<number>
    {
        const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${this._manager.consumerGroupId}-read-index`;
        
        return new Promise((resolve, reject) =>
        {
            this._client.get(key, (err, value) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                resolve(value != null ? JSON.parse(value) : 0);
            });
        });
    }
    
    private incrementConsumerPartitionReadIndex(): Promise<number>
    {
        const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${this._manager.consumerGroupId}-read-index`;
        
        return new Promise((resolve, reject) =>
        {
            this._client.incr(key, (err, val) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                resolve(val);
            });
        });
    }
    
    private retrieveEvent(indexToRead: number): Promise<string>
    {
        return new Promise((resolve, reject) =>
        {
            const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${indexToRead}`;
            
            this._client.get(key, (err, value) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                resolve(value as string);
            });
        });
    }
    
    private retrieveEvents(lowerBoundIndex: number, upperBoundIndex: number)
        : Promise<Array<{ index: number; key: string; value: string }>>
    {
        return new Promise((resolve, reject) =>
        {
            given(lowerBoundIndex, "lowerBoundIndex").ensureHasValue().ensureIsNumber();
            given(upperBoundIndex, "upperBoundIndex").ensureHasValue().ensureIsNumber();
            
            const keys = new Array<{ index: number; key: string; }>();
            for (let i = lowerBoundIndex; i <= upperBoundIndex; i++)
            {
                const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${i}`;
                keys.push({index: i, key});
            }
            
            this._client.mget(...keys.map(t => t.key), (err, values) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }
                
                const result = values.map((t, index) => ({
                    index: keys[index].index,
                    key: keys[index].key,
                    value: t
                }));
                
                resolve(result);
            });
        });
    }
    
    
    private async processEvent(eventName: string, eventRegistration: EventRegistration, event: any): Promise<void>
    {
        const scope = this._manager.serviceLocator.createScope();
        event.$scope = scope;

        this._onEventReceived(scope, this._topic, event);

        const handler = scope.resolve<EdaEventHandler<EdaEvent>>(eventRegistration.eventHandlerTypeName);

        try 
        {
            await handler.handle(event);
        }
        catch (error)
        {
            await this._logger.logWarning(`Error in EventHandler while handling event of type '${eventName}' with data ${JSON.stringify((event as EdaEvent).serialize())}.`);
            await this._logger.logWarning(error);
            throw error;
        }
        finally
        {
            await scope.dispose();
        }   
    }
    
    private track(eventId: string): void
    {
        given(eventId, "eventId").ensureHasValue().ensureIsString();
        
        if (this._trackedIds.length >= 500)
            this._trackedIds = this._trackedIds.skip(200);
        
        this._trackedIds.push(eventId);
    }
    
    private async decompressEvent(eventData: string): Promise<object>
    {
        given(eventData, "eventData").ensureHasValue().ensureIsString();
        eventData = eventData.trim();
        
        if (eventData.startsWith("{"))
            return JSON.parse(eventData);
        
        const decompressed = await Make.callbackToPromise<Buffer>(Zlib.brotliDecompress)(Buffer.from(eventData, "base64"),
            { params: { [Zlib.constants.BROTLI_PARAM_MODE]: Zlib.constants.BROTLI_MODE_TEXT } });

        return JSON.parse(decompressed.toString("utf8"));
    }
}