import { Delay } from "@nivinjoseph/n-util";
import * as Assert from "assert";
import { EdaManager } from "../src/eda-manager";
import { EventBus } from "../src/event-bus";
import { createEdaManager, EventHistory, TestEvent } from "./utils/eda-test-utils";


suite.only("eda tests", () =>
{
    let edaManager: EdaManager;
    
    setup(() =>
    {
        edaManager = createEdaManager();
    });
    
    teardown(async () =>
    {
        await edaManager.dispose();
    });
    
    test("basic", async () =>
    {
        // @ts-ignore
        const consumePromise = edaManager.beginConsumption();
        const eventBus = edaManager.serviceLocator.resolve<EventBus>("EventBus");
        const history = edaManager.serviceLocator.resolve<EventHistory>("EventHistory");
        const testEvent = new TestEvent({ id: "1-foo" });
        const eventIds = [testEvent.id];
        
        await eventBus.publish("basic", testEvent);
        
        await Delay.seconds(2);
        
        // Assert.ok(history.records.length === 1 && history.records[0] === testEvent.id);
        
        Assert.strictEqual(history.records.length, 1, "number of records don't match");
        Assert.deepStrictEqual(history.records, eventIds, "eventIds don't match");
    });
});