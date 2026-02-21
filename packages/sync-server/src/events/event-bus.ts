import { EventEmitter } from 'node:events';

export type ActualEvent =
  | {
      type: 'transaction:created';
      fileId: string;
      transactionId: string;
      amount: number;
      payee?: string;
      category?: string;
    }
  | {
      type: 'transaction:categorized';
      fileId: string;
      transactionId: string;
      categoryId: string;
      source: 'manual' | 'ai' | 'rule';
    }
  | { type: 'contract:created'; fileId: string; contractId: string }
  | {
      type: 'contract:updated';
      fileId: string;
      contractId: string;
      changes: string[];
    }
  | {
      type: 'invoice:uploaded';
      fileId: string;
      invoiceId: string;
      documentId: string;
    }
  | {
      type: 'document:processed';
      fileId: string;
      documentId: string;
      extractedData: Record<string, unknown>;
    }
  | { type: 'forecast:updated'; fileId: string }
  | {
      type: 'classification:completed';
      fileId: string;
      transactionId: string;
      categoryId: string;
      confidence: number;
    }
  | {
      type: 'rule:suggested';
      fileId: string;
      payeePattern: string;
      categoryId: string;
      hitCount: number;
    }
  | { type: 'sync:completed'; fileId: string; messageCount: number };

type EventHandler = (event: ActualEvent) => void;

export class EventBus {
  private static instance: EventBus;
  private emitter: EventEmitter;

  private constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  emit(event: ActualEvent): void {
    this.emitter.emit(event.type, event);
  }

  on(type: ActualEvent['type'], handler: EventHandler): void {
    this.emitter.on(type, handler);
  }

  off(type: ActualEvent['type'], handler: EventHandler): void {
    this.emitter.off(type, handler);
  }

  /** Remove all listeners — useful for testing */
  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }

  /** Reset the singleton — only for testing */
  static resetInstance(): void {
    if (EventBus.instance) {
      EventBus.instance.removeAllListeners();
    }
    EventBus.instance = undefined as unknown as EventBus;
  }
}
