// public
export interface EdaEvent
{
    id: string;
    name: string;
    serialize(): object;
}