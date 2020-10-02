export declare class Topic {
    private readonly _name;
    private readonly _ttlMinutes;
    private readonly _numPartitions;
    private readonly _partitionAffinity;
    get name(): string;
    get ttlMinutes(): number;
    get numPartitions(): number;
    get partitionAffinity(): ReadonlyArray<number> | null;
    get hasPartitionAffinity(): boolean;
    constructor(name: string, ttlMinutes: number, numPartitions: number, partitionAffinity?: ReadonlyArray<number>);
}
