import { EventSubMgr } from "../event-sub-mgr";
import { EdaManager } from "../eda-manager";
import * as Redis from "redis";
import { ConfigurationManager } from "@nivinjoseph/n-config";
import { given } from "@nivinjoseph/n-defensive";
import { Consumer } from "./consumer";
import { Delay } from "@nivinjoseph/n-util";


export class RedisEventSubMgr implements EventSubMgr
{
    private readonly _client: Redis.RedisClient;
    private readonly _consumers = new Array<Consumer>();

    private _isDisposed = false;
    private _disposePromise: Promise<void> | null = null;
    private _manager: EdaManager = null as any;
    
    
    public constructor()
    {
        this._client = ConfigurationManager.getConfig<string>("env") === "dev"
            ? Redis.createClient() : Redis.createClient(ConfigurationManager.getConfig<string>("REDIS_URL"));
    }
    
    
    public initialize(manager: EdaManager): void
    {
        given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(EdaManager);
        given(this, "this").ensure(t => !t._manager, "already initialized");

        this._manager = manager;
        
        this._manager.topics.forEach(topic =>
        {
            if (topic.partitionAffinity != null)
            {
                this._consumers.push(new Consumer(this._client, this._manager, topic.name, topic.partitionAffinity));
            }
            else
            {
                for (let partition = 0; partition < topic.numPartitions; partition++)
                {
                    this._consumers.push(new Consumer(this._client, this._manager, topic.name, partition));
                }
            }
        });
        
        this._consumers.forEach(t => t.consume());
    }
    
    public async wait(): Promise<void>
    {
        while (!this._isDisposed)
        {
            await Delay.seconds(2);
        }
    }
    
    public dispose(): Promise<void>
    {
        if (!this._isDisposed)
        {
            this._isDisposed = true;
            
            this._disposePromise = Promise.all(this._consumers.map(t => t.dispose()))
                .then(() => new Promise((resolve, _) => this._client.quit(() => resolve())));
        }

        return this._disposePromise as Promise<void>;
    }    
}