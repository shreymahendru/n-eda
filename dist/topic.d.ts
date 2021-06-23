export declare class Topic {
    private readonly _name;
    private readonly _ttlMinutes;
    private readonly _numPartitions;
    private _publishOnly;
    private _partitionAffinity;
    private _isDisabled;
    get name(): string;
    get ttlMinutes(): number;
    get numPartitions(): number;
    get publishOnly(): boolean;
    get partitionAffinity(): ReadonlyArray<number> | null;
    get isDisabled(): boolean;
    constructor(name: string, ttlMinutes: number, numPartitions: number);
    subscribe(): Topic;
    configurePartitionAffinity(partitionAffinity: string): Topic;
    disable(): Topic;
}
