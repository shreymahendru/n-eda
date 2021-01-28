import { Consumer } from "./consumer";
import { ConsumerProfiler } from "./consumer-profiler";
export declare class ProfilingConsumer extends Consumer {
    private readonly _profiler;
    get profiler(): ConsumerProfiler;
    protected beginConsume(): Promise<void>;
}
