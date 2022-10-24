import { Serializable } from "@nivinjoseph/n-util";

// public
export interface EdaEvent extends Serializable
{
    get id(): string;
    get name(): string;
    get partitionKey(): string;
}