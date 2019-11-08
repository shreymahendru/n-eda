export declare class Topic {
    private readonly _name;
    private readonly _numPartitions;
    private readonly _partitionAffinity;
    readonly name: string;
    readonly numPartitions: number;
    readonly partitionAffinity: number | null;
    readonly hasPartitionAffinity: boolean;
    constructor(name: string, numPartitions?: number, partitionAffinity?: number);
}
