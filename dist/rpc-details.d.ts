export interface RpcDetails {
    readonly host: string;
    readonly endpoint: string;
}
export interface RpcModel {
    consumerId: string;
    topic: string;
    partition: number;
    eventName: string;
    payload: object;
}
