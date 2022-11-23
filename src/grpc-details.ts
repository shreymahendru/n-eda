export interface GrpcDetails
{
    readonly host: string;
    readonly port: number;
    readonly isSecure?: boolean;
    readonly connectionPoolSize?: number;
}

export interface GrpcModel
{
    consumerId: string;
    topic: string;
    partition: number;
    eventName: string;
    payload: string;
}