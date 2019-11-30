import { Disposable, Delay, Make } from "@nivinjoseph/n-util";
import { given } from "@nivinjoseph/n-defensive";
import * as Redis from "redis";
import { EdaManager } from "../eda-manager";
import { EventRegistration } from "../event-registration";
import { EdaEventHandler } from "../eda-event-handler";
import { EdaEvent } from "../eda-event";
import { ServiceLocator } from "@nivinjoseph/n-ject";
import { Logger } from "@nivinjoseph/n-log";
import { ObjectDisposedException, ApplicationException } from "@nivinjoseph/n-exception";


export class Consumer implements Disposable
{
    private readonly _edaPrefix = "n-eda";
    private readonly _client: Redis.RedisClient;
    private readonly _manager: EdaManager;
    private readonly _logger: Logger;
    private readonly _topic: string;
    private readonly _partition: number;
    private readonly _onEventReceived: (scope: ServiceLocator, topic: string, event: EdaEvent) => void;
    
    private _isDisposed = false;
    private _trackedIds = new Array<string>();
    private _consumePromise: Promise<void> | null = null;
    
    
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

                const indexToRead = readIndex + 1;
                
                let event = await this.retrieveEvent(indexToRead);
                let numReadAttempts = 1;
                const maxReadAttempts = 10;
                while (event == null && numReadAttempts < maxReadAttempts) // we need to do this to deal with race condition
                {
                    await Delay.milliseconds(500);
                    event = await this.retrieveEvent(indexToRead);
                    numReadAttempts++;
                }
                
                if (event == null)
                {
                    try 
                    {
                        throw new ApplicationException(`Failed to read event data after ${maxReadAttempts} read attempts => Topic=${this._topic}; Partition=${this._partition}; ReadIndex=${indexToRead};`);
                    }
                    catch (error)
                    {
                        await this._logger.logError(error);
                    }
                    
                    await this.incrementConsumerPartitionReadIndex();
                    continue;
                }
                
                const eventId = (<any>event).id || (<any>event).$id; // for compatibility with n-domain DomainEvent
                const eventName = (<any>event).name || (<any>event).$name; // for compatibility with n-domain DomainEvent
                const eventRegistration = this._manager.eventMap.get(eventName) as EventRegistration;
                const deserializedEvent = (<any>eventRegistration.eventType).deserializeEvent(event);

                if (this._trackedIds.contains(eventId))
                {
                    await this.incrementConsumerPartitionReadIndex();
                    continue;
                }
                
                try 
                {
                    await Make.retryWithDelay(() => this.processEvent(eventName, eventRegistration, deserializedEvent), 5, 500)();    
                }
                catch (error)
                {
                    await this._logger.logWarning(`Failed to process event of type '${eventName}' with data ${JSON.stringify(event)} after 5 attempts.`);
                    await this._logger.logError(error);
                }
                finally
                {
                    this.track(eventId);
                    await this.incrementConsumerPartitionReadIndex();
                }
            }
            catch (error)
            {
                await this._logger.logWarning(`Error in consumer => ConsumerGroupId: ${this._manager.consumerGroupId}; Topic: ${this._topic}; Partition: ${this._partition};`);
                await this._logger.logError(error);
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

                resolve(JSON.parse(value) || 0);
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

                resolve(JSON.parse(value) || 0);
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
    
    private retrieveEvent(indexToRead: number): Promise<object>
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

                resolve(JSON.parse(value));
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
            await this._logger.logWarning(`Error in EventHandler while handling event of type '${eventName}' with data ${JSON.stringify(event)}.`);
            await this._logger.logError(error);
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
        
        if (this._trackedIds.length >= 50)
            this._trackedIds = this._trackedIds.skip(25).take(50); // 50 is deliberate, we are just taking the rest
        
        this._trackedIds.push(eventId);
    }
}