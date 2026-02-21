import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActualEvent, EventBus } from './event-bus.js';

describe('EventBus', () => {
  afterEach(() => {
    EventBus.resetInstance();
  });

  it('returns the same instance (singleton)', () => {
    const a = EventBus.getInstance();
    const b = EventBus.getInstance();
    expect(a).toBe(b);
  });

  it('emits and receives events', () => {
    const bus = EventBus.getInstance();
    const handler = vi.fn();

    bus.on('transaction:created', handler);
    bus.emit({
      type: 'transaction:created',
      fileId: 'f1',
      transactionId: 't1',
      amount: -5000,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      type: 'transaction:created',
      fileId: 'f1',
      transactionId: 't1',
      amount: -5000,
    });
  });

  it('filters events by type', () => {
    const bus = EventBus.getInstance();
    const txHandler = vi.fn();
    const contractHandler = vi.fn();

    bus.on('transaction:created', txHandler);
    bus.on('contract:created', contractHandler);

    bus.emit({
      type: 'transaction:created',
      fileId: 'f1',
      transactionId: 't1',
      amount: -1000,
    });

    expect(txHandler).toHaveBeenCalledTimes(1);
    expect(contractHandler).not.toHaveBeenCalled();
  });

  it('supports multiple handlers for the same event type', () => {
    const bus = EventBus.getInstance();
    const h1 = vi.fn();
    const h2 = vi.fn();

    bus.on('sync:completed', h1);
    bus.on('sync:completed', h2);

    bus.emit({ type: 'sync:completed', fileId: 'f1', messageCount: 10 });

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes a handler with off()', () => {
    const bus = EventBus.getInstance();
    const handler = vi.fn();

    bus.on('forecast:updated', handler);
    bus.emit({ type: 'forecast:updated', fileId: 'f1' });
    expect(handler).toHaveBeenCalledTimes(1);

    bus.off('forecast:updated', handler);
    bus.emit({ type: 'forecast:updated', fileId: 'f1' });
    expect(handler).toHaveBeenCalledTimes(1); // still 1, not called again
  });

  it('removeAllListeners clears everything', () => {
    const bus = EventBus.getInstance();
    const h1 = vi.fn();
    const h2 = vi.fn();

    bus.on('transaction:created', h1);
    bus.on('contract:created', h2);

    bus.removeAllListeners();

    bus.emit({
      type: 'transaction:created',
      fileId: 'f1',
      transactionId: 't1',
      amount: 0,
    });
    bus.emit({ type: 'contract:created', fileId: 'f1', contractId: 'c1' });

    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('handles all defined event types without error', () => {
    const bus = EventBus.getInstance();
    const handler = vi.fn();

    const events: ActualEvent[] = [
      { type: 'transaction:created', fileId: 'f', transactionId: 't', amount: 0 },
      { type: 'transaction:categorized', fileId: 'f', transactionId: 't', categoryId: 'c', source: 'manual' },
      { type: 'contract:created', fileId: 'f', contractId: 'c' },
      { type: 'contract:updated', fileId: 'f', contractId: 'c', changes: ['name'] },
      { type: 'invoice:uploaded', fileId: 'f', invoiceId: 'i', documentId: 'd' },
      { type: 'document:processed', fileId: 'f', documentId: 'd', extractedData: {} },
      { type: 'forecast:updated', fileId: 'f' },
      { type: 'classification:completed', fileId: 'f', transactionId: 't', categoryId: 'c', confidence: 0.95 },
      { type: 'rule:suggested', fileId: 'f', payeePattern: 'Amazon', categoryId: 'c', hitCount: 5 },
      { type: 'sync:completed', fileId: 'f', messageCount: 1 },
    ];

    for (const event of events) {
      bus.on(event.type, handler);
    }

    for (const event of events) {
      bus.emit(event);
    }

    expect(handler).toHaveBeenCalledTimes(events.length);
  });

  it('resetInstance creates a fresh instance', () => {
    const bus1 = EventBus.getInstance();
    const handler = vi.fn();
    bus1.on('forecast:updated', handler);

    EventBus.resetInstance();

    const bus2 = EventBus.getInstance();
    expect(bus2).not.toBe(bus1);

    bus2.emit({ type: 'forecast:updated', fileId: 'f1' });
    expect(handler).not.toHaveBeenCalled();
  });
});
