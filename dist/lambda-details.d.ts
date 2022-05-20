export interface LambdaDetails {
    readonly region: string;
    readonly funcName: string;
    credentials: {
        readonly accessKeyId: string;
        readonly accessKeySecret: string;
    };
}
