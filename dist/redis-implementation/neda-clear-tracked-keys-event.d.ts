import { Serializable } from "@nivinjoseph/n-util";
import { EdaEvent } from "../eda-event";
export declare class NedaClearTrackedKeysEvent extends Serializable implements EdaEvent {
    private readonly _id;
    get id(): string;
    get name(): string;
    get partitionKey(): string;
    constructor(data: Pick<NedaClearTrackedKeysEvent, "id">);
}
