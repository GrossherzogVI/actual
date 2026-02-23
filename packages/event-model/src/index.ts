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

// ── Domain event types ────────────────────────────────────────────────────────

/** Command Mesh events */
export type CommandMeshEventType =
  | 'command-mesh.chain-parsed'
  | 'command-mesh.step-executed'
  | 'command-mesh.step-failed'
  | 'command-mesh.chain-completed';

export type CommandMeshChainParsed = LedgerEvent<{
  chain: string;
  stepCount: number;
  errorCount: number;
}>;

export type CommandMeshStepExecuted = LedgerEvent<{
  stepId: string;
  canonical: string;
  durationMs: number;
}>;

export type CommandMeshStepFailed = LedgerEvent<{
  stepId: string;
  canonical: string;
  errorMessage: string;
  durationMs: number;
}>;

/** Playbook events */
export type PlaybookEventType =
  | 'playbook.created'
  | 'playbook.started'
  | 'playbook.step-completed'
  | 'playbook.completed'
  | 'playbook.aborted';

export type PlaybookCreated = LedgerEvent<{
  playbookId: string;
  title: string;
  stepCount: number;
}>;

export type PlaybookStepCompleted = LedgerEvent<{
  playbookId: string;
  stepIndex: number;
  outcome: 'success' | 'skipped' | 'failed';
}>;

/** Delegate lane events */
export type DelegateEventType =
  | 'delegate.lane-created'
  | 'delegate.lane-assigned'
  | 'delegate.batch-applied'
  | 'delegate.lane-escalated'
  | 'delegate.lane-resolved';

export type DelegateLaneCreated = LedgerEvent<{
  laneId: string;
  priority: string;
  itemCount: number;
}>;

export type DelegateLaneEscalated = LedgerEvent<{
  laneId: string;
  reason: string;
  escalatedToId: string;
}>;

/** Scenario / simulation events */
export type ScenarioEventType =
  | 'scenario.created'
  | 'scenario.run-started'
  | 'scenario.run-completed'
  | 'scenario.outcome-recorded';

export type ScenarioRunCompleted = LedgerEvent<{
  scenarioId: string;
  durationMs: number;
  outcomeLabel: string;
  confidence: number;
}>;

/** Temporal events */
export type TemporalEventType =
  | 'temporal.deadline-computed'
  | 'temporal.deadline-breached'
  | 'temporal.payment-overdue';

export type TemporalDeadlineBreached = LedgerEvent<{
  contractId: string;
  deadlineMs: number;
  breachedAtMs: number;
  gracePeriodDays: number;
}>;

/** Autopilot events */
export type AutopilotEventType =
  | 'autopilot.rule-triggered'
  | 'autopilot.action-applied'
  | 'autopilot.action-rolled-back'
  | 'autopilot.paused'
  | 'autopilot.resumed';

export type AutopilotRuleTriggered = LedgerEvent<{
  ruleId: string;
  ruleLabel: string;
  targetId: string;
  targetType: string;
}>;

/** Focus session events */
export type FocusEventType =
  | 'focus.session-started'
  | 'focus.session-ended'
  | 'focus.loop-entered'
  | 'focus.loop-exited';

export type FocusSessionStarted = LedgerEvent<{
  sessionId: string;
  loop: string;
  actorId: string;
}>;

/** Runtime / system events */
export type RuntimeEventType =
  | 'runtime.boot'
  | 'runtime.ready'
  | 'runtime.degraded'
  | 'runtime.shutdown'
  | 'runtime.error';

export type RuntimeError = LedgerEvent<{
  errorCode: string;
  message: string;
  surface: string;
  fatal: boolean;
}>;

/** Union of all domain event types */
export type DomainEventType =
  | CommandMeshEventType
  | PlaybookEventType
  | DelegateEventType
  | ScenarioEventType
  | TemporalEventType
  | AutopilotEventType
  | FocusEventType
  | RuntimeEventType;
