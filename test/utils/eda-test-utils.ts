import { given } from "@nivinjoseph/n-defensive";
import { ComponentInstaller, Container, inject, Registry } from "@nivinjoseph/n-ject";
import { ConsoleLogger, LogDateTimeZone, Logger } from "@nivinjoseph/n-log";
import { Delay, DisposableWrapper, Duration, Serializable, serialize } from "@nivinjoseph/n-util";
import * as Redis from "redis";
import { EdaEventHandler } from "../../src";
import { EdaEvent } from "../../src/eda-event";
import { EdaManager } from "../../src/eda-manager";
import { RedisEventBus } from "../../src/redis-implementation/redis-event-bus";
import { RedisEventSubMgr } from "../../src/redis-implementation/redis-event-sub-mgr";
import { Topic } from "../../src/topic";
import { event } from "../../src/event";


export class EventHistory
{
    private readonly _historicalRecords = new Array<string>();
    
    
    public get records(): ReadonlyArray<string> { return this._historicalRecords; }
    
    
    public async recordEvent(event: EdaEvent): Promise<void>
    {
        given(event, "event").ensureHasValue().ensureIsObject();
        
        await Delay.milliseconds(300);
        
        this._historicalRecords.push(event.id);
    }
}

class CommonComponentInstaller implements ComponentInstaller
{
    public install(registry: Registry): void
    {
        given(registry, "registry").ensureHasValue().ensureIsObject();
        
        const edaRedisClient = Redis.createClient({ return_buffers: true });
        const edaRedisClientDisposable = new DisposableWrapper(async () =>
        {
            await Delay.seconds(5);
            await new Promise<void>((resolve, _) => edaRedisClient.quit(() => resolve()));
        });
        
        registry
            .registerInstance("Logger", new ConsoleLogger({ logDateTimeZone: LogDateTimeZone.est }))
            .registerInstance("EdaRedisClient", edaRedisClient)
            .registerInstance("EdaRedisClientDisposable", edaRedisClientDisposable)
            .registerSingleton("EventHistory", EventHistory);
    }
}


export class TestEvent extends Serializable implements EdaEvent
{
    private readonly _id: string;
    
    
    @serialize
    public get id(): string { return this._id; }
    
    @serialize // has to be serialized for eda purposes
    public get name(): string { return (<Object>TestEvent).getTypeName(); }
    
    
    public constructor(data: { id: string; })
    {
        super(data);

        const { id } = data;

        given(id, "id").ensureHasValue().ensureIsString();
        this._id = id;
    }
}


@event(TestEvent)
@inject("Logger", "EventHistory")
class TestEventHandler implements EdaEventHandler<TestEvent>
{
    private readonly _logger: Logger;
    private readonly _eventHistory: EventHistory;


    public constructor(logger: Logger, eventHistory: EventHistory)
    {
        given(logger, "logger").ensureHasValue().ensureIsObject();
        this._logger = logger;
        
        given(eventHistory, "eventHistory").ensureHasValue().ensureIsObject();
        this._eventHistory = eventHistory;
    }


    public async handle(event: TestEvent): Promise<void>
    {
        given(event, "event").ensureHasValue().ensureIsObject().ensureIsType(TestEvent);

        await this._eventHistory.recordEvent(event);
        
        const message = `Event '${event.name}' with id '${event.id}'.`;
        // if (event.id.endsWith("9"))
            await this._logger.logInfo(message);
    }
}

export function createEdaManager(): EdaManager
{
    const container = new Container();
    container.install(new CommonComponentInstaller());
    const edaManager = new EdaManager(container);
    const basicTopic = new Topic("basic", Duration.fromHours(1), 25).subscribe();
    edaManager
        .registerEventSubscriptionManager(RedisEventSubMgr, "main")
        .cleanUpKeys()
        // .proxyToAwsLambda("testFunc")
        .useConsumerName("test")
        .registerTopics(basicTopic)
        .usePartitionKeyMapper((event) =>
        {
            const id = event.id;
            return id.contains("-") ? id.split("-")[0] : id;
        })
        .registerEventHandlers(TestEventHandler)
        .registerEventBus(RedisEventBus);
    
    container.bootstrap();
    edaManager.bootstrap();
    
    return edaManager;
}