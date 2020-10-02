import { given } from "@nivinjoseph/n-defensive";

// public
export class Topic
{
    private readonly _name: string;
    private readonly _ttlMinutes: number;
    private readonly _numPartitions: number;
    private readonly _partitionAffinity: ReadonlyArray<number> | null;
    
    
    public get name(): string { return this._name; }
    public get ttlMinutes(): number { return this._ttlMinutes; }
    public get numPartitions(): number { return this._numPartitions; }
    public get partitionAffinity(): ReadonlyArray<number> | null { return this._partitionAffinity; }
    public get hasPartitionAffinity(): boolean { return this._partitionAffinity != null; }
    
    
    public constructor(name: string, ttlMinutes: number, numPartitions: number, partitionAffinity?: ReadonlyArray<number>)
    {
        given(name, "name").ensureHasValue().ensureIsString();
        this._name = name.trim();
        
        given(ttlMinutes, "ttlMinutes").ensureHasValue().ensureIsNumber().ensure(t => t > 0);
        this._ttlMinutes = ttlMinutes;
        
        given(numPartitions, "numPartitions").ensureHasValue().ensureIsNumber().ensure(t => t > 0);
        this._numPartitions = numPartitions;
        
        given(partitionAffinity as ReadonlyArray<number>, "partitionAffinity").ensureIsArray()
            .ensure(t => t.isNotEmpty)
            .ensure(t => t.every(item => item >= 0 && item < this._numPartitions));
        this._partitionAffinity = partitionAffinity == null ? null : partitionAffinity;
    }
}