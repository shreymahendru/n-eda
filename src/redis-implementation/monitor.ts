import { Consumer } from "./consumer";
import Redis from "ioredis";
import { given } from "@nivinjoseph/n-defensive";
import { ApplicationException, ObjectDisposedException } from "@nivinjoseph/n-exception";
import { Delay, DelayCanceller, Disposable, Make } from "@nivinjoseph/n-util";


export class Monitor implements Disposable
{
    private readonly _client: Redis;
    private readonly _consumers = new Array<Consumer>();
    private readonly _indexKeys = new Array<string>;
    private _isRunning = false;
    private _isDisposed = false;
    private _runPromise: Promise<void> | null = null;
    private _delayCanceller: DelayCanceller | null = null;
    
    
    public constructor(client: Redis, consumers: ReadonlyArray<Consumer>)
    {
        given(client, "client").ensureHasValue().ensureIsObject();
        this._client = client;
        
        given(consumers, "consumers").ensureHasValue().ensureIsArray().ensureIsNotEmpty();
        consumers.forEach(consumer =>
        {
            this._consumers.push(consumer);
            this._indexKeys.push(consumer.writeIndexKey, consumer.readIndexKey);
        });
    }
    
    
    public start(): void
    {
        if (this._isDisposed)
            throw new ObjectDisposedException("Monitor");
        
        if (this._isRunning)
            return;
        
        this._isRunning = true;
        
        this._runPromise = this._run();
    }
    
    public dispose(): Promise<void>
    {
        this._isRunning = false;
        this._isDisposed = true;
        
        if (this._delayCanceller != null)
            this._delayCanceller.cancel!();
        
        return this._runPromise ?? Promise.resolve();
    }
    
    private async _run(): Promise<void>
    {
        while (this._isRunning)
        {
            const values = await this._fetchPartitionWriteAndConsumerPartitionReadIndexes();
            if (values.length % 2 !== 0 || values.length / 2 !== this._consumers.length)
                throw new ApplicationException("Monitor index values count is not valid");    
            
            for (let i = 0; i < values.length; i += 2)
            {
                const writeIndex = values[i];
                const readIndex = values[i + 1];
                
                if (readIndex >= writeIndex)
                    continue;
                
                const consumer = this._consumers[i / 2];
                consumer.awaken();
            }
            
            this._delayCanceller = {};
            await Delay.milliseconds(Make.randomInt(80, 120), this._delayCanceller);
        }
    }
    
    private _fetchPartitionWriteAndConsumerPartitionReadIndexes(): Promise<Array<number>>
    {
        return new Promise((resolve, reject) =>
        {
            this._client.mget(...this._indexKeys, (err, results) =>
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                const values = results!.map(value => value != null ? JSON.parse(value) as number : 0);
                resolve(values);
            }).catch(e => reject(e));
        });
    }
}