import { Disposable } from "@nivinjoseph/n-util";
import { EdaManager } from "./eda-manager";
export interface EventSubMgr extends Disposable {
    initialize(manager: EdaManager): void;
}
