import { Serializable } from "@nivinjoseph/n-util";

// public
export interface EdaEvent extends Serializable
{
    id: string;
    name: string;
}