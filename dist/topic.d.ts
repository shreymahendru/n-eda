import { Duration } from "@nivinjoseph/n-util";
export declare class Topic {
    private readonly _name;
    private readonly _ttlMinutes;
    private readonly _numPartitions;
    private readonly _flush;
    private _publishOnly;
    private _partitionAffinity;
    private _isDisabled;
    get name(): string;
    get ttlMinutes(): number;
    get numPartitions(): number;
    get publishOnly(): boolean;
    get partitionAffinity(): ReadonlyArray<number> | null;
    get isDisabled(): boolean;
    get flush(): boolean;
    constructor(name: string, ttlDuration: Duration, numPartitions: number, flush?: boolean);
    subscribe(): Topic;
    configurePartitionAffinity(partitionAffinity: string): Topic;
    disable(): Topic;
}
