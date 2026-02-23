import { rankRecommendations } from '@finance-os/domain-kernel';
import type { Recommendation } from '@finance-os/domain-kernel';

import type { GatewayRepository } from '../repositories/types';
import type {
  ActionOutcome,
  FocusAction,
  FocusPanel,
  NarrativePulse,
  OpsActivityEvent,
  WorkflowAction,
} from '../types';

import { nanoid, toActionOutcomeActivity } from './helpers';

export type FocusDeps = {
  appendOpsActivityEvent: (event: OpsActivityEvent) => Promise<void>;
};

export function createFocusService(
  repository: GatewayRepository,
  deps: FocusDeps,
) {
  async function resolveNextAction(): Promise<WorkflowAction> {
    const state = await repository.getOpsState();

    if (state.urgentReviews > 0) {
      return {
        id: 'next-urgent-review',
        title: `${state.urgentReviews} urgent review item(s)`,
        route: '/review?priority=urgent',
        confidence: 0.94,
      };
    }

    if (state.expiringContracts > 0) {
      return {
        id: 'next-expiring-contracts',
        title: `${state.expiringContracts} contract(s) expiring in 30d`,
        route: '/contracts?filter=expiring',
        confidence: 0.89,
      };
    }

    return {
      id: 'next-close-routine',
      title: 'Run weekly close routine',
      route: '/ops',
      confidence: 0.8,
    };
  }

  async function getMoneyPulse() {
    const state = await repository.getOpsState();
    return {
      pendingReviews: state.pendingReviews,
      urgentReviews: state.urgentReviews,
      expiringContracts: state.expiringContracts,
      generatedAtMs: Date.now(),
    };
  }

  async function recommend(): Promise<Recommendation[]> {
    const state = await repository.getOpsState();

    return rankRecommendations([
      {
        id: 'rec-review-urgent',
        title: 'Prioritize urgent review queue',
        confidence: 0.92,
        provenance: 'focus-engine',
        expectedImpact: 'risk-reduction',
        reversible: true,
        rationale: `${state.urgentReviews} urgent review item(s) can trigger immediate cashflow mistakes.`,
      },
      {
        id: 'rec-contract-expiring',
        title: 'Review expiring contracts this week',
        confidence: 0.88,
        provenance: 'contracts-engine',
        expectedImpact: 'cost-avoidance',
        reversible: true,
        rationale: `${state.expiringContracts} contract(s) are within cancellation window.`,
      },
      {
        id: 'rec-close-loop',
        title: 'Run weekly close loop',
        confidence: 0.81,
        provenance: 'workflow-engine',
        expectedImpact: 'operational-compression',
        reversible: true,
        rationale: `${state.pendingReviews} pending item(s) can be compressed through close routine automation.`,
      },
    ]);
  }

  async function getNarrativePulse(): Promise<NarrativePulse> {
    const now = Date.now();
    const state = await repository.getOpsState();
    const recs = await recommend();
    const openLanes = await repository.listDelegateLanes(100, {
      status: 'assigned',
    });
    const dueSoon = openLanes.filter(
      lane =>
        typeof lane.dueAtMs === 'number' &&
        lane.dueAtMs <= now + 72 * 60 * 60 * 1000,
    ).length;
    const latestClose = (await repository.listCloseRuns(1))[0];

    const highlights = [
      `${state.urgentReviews} urgent review item(s) and ${state.pendingReviews} pending total.`,
      `${state.expiringContracts} contract(s) expiring in the next 30 days.`,
      `${dueSoon} delegate lane(s) due within 72 hours.`,
      latestClose
        ? `Last ${latestClose.period} close had ${latestClose.exceptionCount} exception(s).`
        : 'No close history yet.',
    ];

    const actionHints = recs
      .slice(0, 3)
      .map(recommendation => recommendation.title);

    return {
      summary:
        actionHints.length > 0
          ? `Top move now: ${actionHints[0]}.`
          : 'No high-confidence recommendations at this time.',
      highlights,
      actionHints,
      generatedAtMs: now,
    };
  }

  async function getAdaptiveFocusPanel(): Promise<FocusPanel> {
    const state = await repository.getOpsState();
    const now = Date.now();
    const activeLanes = await repository.listDelegateLanes(200, {
      assignedBy: 'owner',
    });
    const openLanes = activeLanes.filter(
      lane => lane.status === 'assigned' || lane.status === 'accepted',
    );
    const dueSoonLanes = openLanes.filter(
      lane =>
        typeof lane.dueAtMs === 'number' &&
        lane.dueAtMs <= now + 72 * 60 * 60 * 1000,
    );
    const staleAssignedLanes = openLanes.filter(
      lane =>
        lane.status === 'assigned' &&
        now - lane.updatedAtMs >= 48 * 60 * 60 * 1000,
    );
    const recentOutcomes = await repository.listActionOutcomes({ limit: 120 });
    const latestOutcomeByAction = new Map<string, ActionOutcome>();
    for (const outcome of recentOutcomes) {
      if (!latestOutcomeByAction.has(outcome.actionId)) {
        latestOutcomeByAction.set(outcome.actionId, outcome);
      }
    }

    const baseActions = [
      {
        id: 'focus-urgent-review',
        title: 'Clear urgent review queue',
        route: '/review?priority=urgent',
        score: state.urgentReviews * 100,
        reason: 'Urgent queue items carry highest immediate financial risk.',
        recommendedChain: 'triage -> open-review',
        recommendedAssignee: 'delegate',
        recommendedExecutionMode: 'live',
        recommendedGuardrailProfile: 'strict',
        recommendedRollbackWindowMinutes: 120,
        expectedImpact: 'risk-reduction',
      },
      {
        id: 'focus-expiring-contracts',
        title: 'Inspect expiring contracts',
        route: '/contracts?filter=expiring',
        score: state.expiringContracts * 85,
        reason: 'Contract deadlines create time-sensitive spend outcomes.',
        recommendedChain:
          'triage -> open-expiring-contracts -> assign-expiring-contracts-lane',
        recommendedAssignee: 'delegate',
        recommendedExecutionMode: 'live',
        recommendedGuardrailProfile: 'balanced',
        recommendedRollbackWindowMinutes: 180,
        expectedImpact: 'cost-avoidance',
      },
      {
        id: 'focus-close-routine',
        title: 'Run weekly close',
        route: '/ops',
        score: Math.max(20, state.pendingReviews * 8),
        reason: 'Close loop compresses unresolved manual operations.',
        recommendedChain: 'triage -> close-weekly -> refresh',
        recommendedAssignee: 'delegate',
        recommendedExecutionMode: 'live',
        recommendedGuardrailProfile: 'strict',
        recommendedRollbackWindowMinutes: 240,
        expectedImpact: 'operational-compression',
      },
      {
        id: 'focus-delegate-lanes-due',
        title: 'Review delegate lanes due in 72h',
        route: '/ops#delegate-lanes',
        score: dueSoonLanes.length * 92,
        reason:
          dueSoonLanes.length > 0
            ? `${dueSoonLanes.length} mission lane(s) are close to deadline.`
            : 'No due-soon mission lanes.',
        recommendedChain:
          'triage -> delegate-triage-batch -> apply-batch-policy',
        recommendedAssignee: 'delegate',
        recommendedExecutionMode: 'live',
        recommendedGuardrailProfile: 'balanced',
        recommendedRollbackWindowMinutes: 90,
        expectedImpact: 'throughput-acceleration',
      },
      {
        id: 'focus-delegate-lanes-stale',
        title: 'Nudge stale assigned delegate lanes',
        route: '/ops#delegate-lanes',
        score: staleAssignedLanes.length * 76,
        reason:
          staleAssignedLanes.length > 0
            ? `${staleAssignedLanes.length} assigned lane(s) have no progress for 48h.`
            : 'No stale assigned mission lanes.',
        recommendedChain:
          'triage -> escalate-stale-lanes -> delegate-triage-batch -> apply-batch-policy',
        recommendedAssignee: 'delegate',
        recommendedExecutionMode: 'live',
        recommendedGuardrailProfile: 'strict',
        recommendedRollbackWindowMinutes: 90,
        expectedImpact: 'deadline-risk-control',
      },
    ] satisfies FocusAction[];

    const actions = baseActions
      .map(action => {
        const latest = latestOutcomeByAction.get(action.id);
        if (!latest) {
          return action;
        }

        const hoursSince = (now - latest.recordedAtMs) / (60 * 60 * 1000);
        if (
          (latest.outcome === 'accepted' ||
            latest.outcome === 'completed' ||
            latest.outcome === 'done') &&
          hoursSince < 24
        ) {
          return {
            ...action,
            score: action.score * 0.35,
            reason: `${action.reason} Cooldown after recent completion.`,
          };
        }

        if (latest.outcome === 'deferred' && hoursSince < 72) {
          return {
            ...action,
            score: action.score * 1.15,
            reason: `${action.reason} Previously deferred.`,
          };
        }

        if (latest.outcome === 'ignored' && hoursSince < 72) {
          return {
            ...action,
            score: action.score * 1.25,
            reason: `${action.reason} Previously ignored.`,
          };
        }

        return action;
      })
      .filter(action => action.score > 0)
      .sort((a, b) => b.score - a.score);

    return {
      actions,
      generatedAtMs: Date.now(),
    };
  }

  async function recordActionOutcome(input: {
    actionId: string;
    outcome: string;
    notes?: string;
  }) {
    const outcome = await repository.recordActionOutcome({
      id: nanoid(),
      actionId: input.actionId,
      outcome: input.outcome,
      notes: input.notes,
      recordedAtMs: Date.now(),
    });
    await deps.appendOpsActivityEvent(toActionOutcomeActivity(outcome));
    return outcome;
  }

  async function listActionOutcomes(input?: {
    limit?: number;
    actionId?: string;
  }): Promise<ActionOutcome[]> {
    return repository.listActionOutcomes({
      limit: Math.max(1, Math.min(input?.limit ?? 50, 200)),
      actionId: input?.actionId,
    });
  }

  async function explain(recommendation: Recommendation) {
    return {
      explanation:
        `Recommendation ${recommendation.id} targets ${recommendation.expectedImpact}. ` +
        `Confidence ${recommendation.confidence.toFixed(2)} with rationale: ${recommendation.rationale}`,
      confidence: recommendation.confidence,
      reversible: recommendation.reversible,
    };
  }

  async function classify(payee: string) {
    const normalized = payee.toLowerCase();

    if (
      normalized.includes('rewe') ||
      normalized.includes('edeka') ||
      normalized.includes('aldi')
    ) {
      return { categoryHint: 'lebensmittel.supermarkt', confidence: 0.87 };
    }

    if (normalized.includes('bahn') || normalized.includes('db')) {
      return { categoryHint: 'mobilitaet.oepnv', confidence: 0.84 };
    }

    if (normalized.includes('netflix') || normalized.includes('spotify')) {
      return { categoryHint: 'freizeit.streaming', confidence: 0.91 };
    }

    return { categoryHint: 'sonstiges.unkategorisiert', confidence: 0.57 };
  }

  async function forecast(months: number) {
    const state = await repository.getOpsState();
    const projectedMonthlyCommitment =
      120_000 + state.pendingReviews * 500 + state.expiringContracts * 300;

    return {
      months,
      projectedMonthlyCommitment,
      projectedTotalCommitment: projectedMonthlyCommitment * months,
      generatedAtMs: Date.now(),
    };
  }

  return {
    resolveNextAction,
    getMoneyPulse,
    getNarrativePulse,
    getAdaptiveFocusPanel,
    recordActionOutcome,
    listActionOutcomes,
    recommend,
    explain,
    classify,
    forecast,
  };
}
