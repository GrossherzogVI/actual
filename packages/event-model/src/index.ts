import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 18);

export type LedgerEvent<TPayload = Record<string, unknown>> = {
  eventId: string;
  aggregateId: string;
  aggregateType: string;
  type: string;
  payload: TPayload;
  actorId: string;
  occurredAtMs: number;
  version: number;
};

export type EventStore = {
  append<TPayload>(
    aggregateId: string,
    aggregateType: string,
    actorId: string,
    type: string,
    payload: TPayload,
  ): LedgerEvent<TPayload>;
  stream(aggregateId: string): LedgerEvent[];
  streamAll(limit?: number): LedgerEvent[];
};

export class InMemoryEventStore implements EventStore {
  private readonly eventsByAggregate = new Map<string, LedgerEvent[]>();

  append<TPayload>(
    aggregateId: string,
    aggregateType: string,
    actorId: string,
    type: string,
    payload: TPayload,
  ): LedgerEvent<TPayload> {
    const existing = this.eventsByAggregate.get(aggregateId) || [];

    const event: LedgerEvent<TPayload> = {
      eventId: nanoid(),
      aggregateId,
      aggregateType,
      type,
      payload,
      actorId,
      occurredAtMs: Date.now(),
      version: existing.length + 1,
    };

    existing.push(event as LedgerEvent);
    this.eventsByAggregate.set(aggregateId, existing);
    return event;
  }

  stream(aggregateId: string): LedgerEvent[] {
    return [...(this.eventsByAggregate.get(aggregateId) || [])];
  }

  streamAll(limit = 500): LedgerEvent[] {
    const all = Array.from(this.eventsByAggregate.values()).flat();
    return all.sort((a, b) => b.occurredAtMs - a.occurredAtMs).slice(0, limit);
  }
}
