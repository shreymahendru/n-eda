// // public

// export type EventInfo = {
//     readonly topic: string;
//     readonly partition: number;
//     readonly partitionKey: string;
//     readonly eventName: string;
//     readonly eventId: string;
// };

// export type ConsumerTracer = (eventInfo: EventInfo, next: () => Promise<void>) => Promise<void>;