import { customAlphabet } from 'nanoid';

import {
  parseCommandChain,
  rankRecommendations,
  type Recommendation,
} from '@finance-os/domain-kernel';

import type { GatewayRepository } from '../repositories/types';
import type { GatewayQueue, QueueJob } from '../queue/types';
import type {
  ActionOutcome,
  CloseRun,
  DelegateLane,
  DelegateLaneEvent,
  EgressAuditEntry,
  EgressPolicy,
  FocusPanel,
  LedgerEvent,
  NarrativePulse,
  OpsActivityEvent,
  PlaybookRun,
  ScenarioAdoptionCheck,
  ScenarioBranch,
  ScenarioComparison,
  ScenarioLineage,
  ScenarioLineageNode,
  ScenarioMutation,
  WorkflowAction,
  WorkflowCommandExecution,
  WorkflowCommandExecutionStep,
  WorkflowPlaybook,
} from '../types';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 16);

export type GatewayService = ReturnType<typeof createGatewayService>;

function queueJob(name: string, payload: Record<string, unknown>): QueueJob {
  return {
    id: nanoid(),
    name,
    payload,
    createdAtMs: Date.now(),
  };
}

const DELEGATE_BLOCKED_STEPS = new Set([
  'run-close-weekly',
  'run-close-monthly',
  'create-default-playbook',
  'assign-expiring-contracts-lane',
]);

const DELEGATE_ALLOWED_TRANSITIONS: Record<
  DelegateLane['status'],
  DelegateLane['status'][]
> = {
  assigned: ['accepted', 'rejected'],
  accepted: ['completed', 'rejected'],
  completed: ['assigned'],
  rejected: ['assigned'],
};

function outcomeSeverity(outcome: string): OpsActivityEvent['severity'] {
  const normalized = outcome.toLowerCase();
  if (
    normalized.includes('failed') ||
    normalized.includes('error') ||
    normalized.includes('critical')
  ) {
    return 'critical';
  }
  if (
    normalized.includes('rejected') ||
    normalized.includes('defer') ||
    normalized.includes('ignore')
  ) {
    return 'warn';
  }
  return 'info';
}

function laneSeverity(
  lane: DelegateLane,
  now: number,
): OpsActivityEvent['severity'] {
  if (lane.status === 'rejected') {
    return lane.priority === 'critical' ? 'critical' : 'warn';
  }
  if (
    (lane.status === 'assigned' || lane.status === 'accepted') &&
    typeof lane.dueAtMs === 'number' &&
    lane.dueAtMs < now
  ) {
    return 'warn';
  }
  return 'info';
}

function toPlaybookToken(command: Record<string, unknown>): string | null {
  const verb = typeof command.verb === 'string' ? command.verb : null;
  const token = typeof command.token === 'string' ? command.token : null;
  const chainToken =
    typeof command.chainToken === 'string' ? command.chainToken : null;

  const candidate = chainToken || token || verb;
  if (!candidate) {
    return null;
  }

  if (candidate === 'resolve-next-action' || candidate === 'resolve-next') {
    return 'triage';
  }
  if (candidate === 'run-close') {
    const period = command.period;
    return period === 'monthly' ? 'close-monthly' : 'close-weekly';
  }
  if (candidate === 'run-close-weekly') {
    return 'close-weekly';
  }
  if (candidate === 'run-close-monthly') {
    return 'close-monthly';
  }
  if (candidate === 'open-expiring-contracts') {
    return 'expiring<30d';
  }
  if (candidate === 'assign-expiring-contracts-lane') {
    return 'batch-renegotiate';
  }
  if (candidate === 'open-urgent-review') {
    return 'open-review';
  }
  if (candidate === 'refresh-command-center') {
    return 'refresh';
  }
  if (candidate === 'create-default-playbook') {
    return 'playbook-create-default';
  }
  if (candidate === 'run-first-playbook') {
    return 'run-first';
  }

  return null;
}

export function createGatewayService(
  repository: GatewayRepository,
  queue: GatewayQueue,
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

  async function getNarrativePulse(): Promise<NarrativePulse> {
    const now = Date.now();
    const state = await repository.getOpsState();
    const recs = await recommend();
    const openLanes = await repository.listDelegateLanes(100, {
      status: 'assigned',
    });
    const dueSoon = openLanes.filter(
      lane => typeof lane.dueAtMs === 'number' && lane.dueAtMs <= now + 72 * 60 * 60 * 1000,
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

    const actionHints = recs.slice(0, 3).map(recommendation => recommendation.title);

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

  async function listPlaybooks(): Promise<WorkflowPlaybook[]> {
    return repository.listPlaybooks();
  }

  async function listPlaybookRuns(
    limit = 20,
    filters?: {
      playbookId?: string;
      actorId?: string;
      sourceSurface?: string;
      dryRun?: boolean;
      hasErrors?: boolean;
    },
  ) {
    return repository.listPlaybookRuns(Math.max(1, Math.min(limit, 200)), filters);
  }

  async function listWorkflowCommandRuns(
    limit = 20,
    filters?: {
      actorId?: string;
      sourceSurface?: string;
      dryRun?: boolean;
      hasErrors?: boolean;
    },
  ) {
    return repository.listWorkflowCommandRuns(
      Math.max(1, Math.min(limit, 200)),
      filters,
    );
  }

  async function createPlaybook(input: {
    name: string;
    description: string;
    commands: Array<Record<string, unknown>>;
  }): Promise<WorkflowPlaybook> {
    const now = Date.now();
    const playbook = await repository.createPlaybook({
      id: nanoid(),
      name: input.name,
      description: input.description,
      commands: input.commands,
      createdAtMs: now,
    });

    await queue.enqueue(
      queueJob('workflow.playbook.created', {
        playbookId: playbook.id,
      }),
    );

    return playbook;
  }

  async function runPlaybook(
    playbookId: string,
    dryRun: boolean,
    actorId = 'owner',
    sourceSurface = 'unknown',
  ): Promise<PlaybookRun | null> {
    const playbook = await repository.getPlaybookById(playbookId);
    if (!playbook) return null;

    const baseSteps = playbook.commands.map((command, index) => {
      const token = toPlaybookToken(command);
      return {
        index,
        command,
        token,
      };
    });

    const unsupportedSteps = baseSteps
      .filter(step => !step.token)
      .map(step => ({
        index: step.index,
        command: step.command,
        status: 'error',
        detail: 'Unsupported playbook command payload.',
      }));

    const executableSteps = baseSteps.filter(
      step => typeof step.token === 'string',
    ) as Array<{
      index: number;
      command: Record<string, unknown>;
      token: string;
    }>;

    const chain = executableSteps.map(step => step.token).join(' -> ');

    let commandRun:
      | WorkflowCommandExecution
      | undefined;

    if (chain) {
      commandRun = await executeWorkflowCommandChain({
        chain,
        dryRun,
        actorId,
        sourceSurface,
      });
    }

    const executedSteps = executableSteps.map((step, index) => {
      const executionStep = commandRun?.steps[index];
      if (!executionStep) {
        return {
          index: step.index,
          command: step.command,
          status: 'error',
          detail: 'Missing execution result for playbook command.',
        };
      }

      return {
        index: step.index,
        command: step.command,
        status: executionStep.status,
        detail: executionStep.detail,
      };
    });

    const steps = [...unsupportedSteps, ...executedSteps].sort(
      (a, b) => a.index - b.index,
    );

    const run: PlaybookRun = {
      id: nanoid(),
      playbookId,
      chain,
      dryRun,
      executedSteps: steps.length,
      errorCount: steps.filter(step => step.status === 'error').length,
      actorId,
      sourceSurface,
      steps,
      createdAtMs: Date.now(),
    };

    await repository.createPlaybookRun(run);
    await queue.enqueue(
      queueJob('workflow.playbook.run', {
        runId: run.id,
        playbookId,
        chain,
        dryRun,
        actorId,
        sourceSurface,
        errorCount: run.errorCount,
      }),
    );

    return run;
  }

  async function replayPlaybookRun(input: {
    runId: string;
    dryRun?: boolean;
    actorId?: string;
    sourceSurface?: string;
  }): Promise<PlaybookRun | null> {
    const previousRun = await repository.getPlaybookRunById(input.runId);
    if (!previousRun) {
      return null;
    }

    return runPlaybook(
      previousRun.playbookId,
      typeof input.dryRun === 'boolean' ? input.dryRun : previousRun.dryRun,
      input.actorId || previousRun.actorId,
      input.sourceSurface || previousRun.sourceSurface,
    );
  }

  async function runCloseRoutine(period: 'weekly' | 'monthly'): Promise<CloseRun> {
    const state = await repository.getOpsState();
    const run: CloseRun = {
      id: nanoid(),
      period,
      exceptionCount: state.pendingReviews + state.expiringContracts,
      summary: {
        pendingReviews: state.pendingReviews,
        urgentReviews: state.urgentReviews,
        expiringContracts: state.expiringContracts,
      },
      createdAtMs: Date.now(),
    };

    await repository.createCloseRun(run);
    await queue.enqueue(
      queueJob('workflow.close.run', {
        runId: run.id,
        period,
        exceptionCount: run.exceptionCount,
      }),
    );

    return run;
  }

  async function listCloseRuns(
    limit = 20,
    filters?: {
      period?: CloseRun['period'];
      hasExceptions?: boolean;
    },
  ) {
    return repository.listCloseRuns(Math.max(1, Math.min(limit, 200)), filters);
  }

  async function applyBatchPolicy(
    ids: string[],
    status: string,
    resolvedAction: string,
  ): Promise<{ updatedCount: number }> {
    const state = await repository.getOpsState();
    const updatedCount = Math.min(ids.length, state.pendingReviews);

    await repository.setOpsState({
      pendingReviews: Math.max(0, state.pendingReviews - updatedCount),
    });

    await queue.enqueue(
      queueJob('workflow.batch-policy.applied', {
        ids,
        status,
        resolvedAction,
        updatedCount,
      }),
    );

    return { updatedCount };
  }

  async function executeWorkflowCommandChain(input: {
    chain: string;
    assignee?: string;
    dryRun?: boolean;
    actorId?: string;
    sourceSurface?: string;
  }): Promise<WorkflowCommandExecution> {
    const parsed = parseCommandChain(input.chain);
    const steps: WorkflowCommandExecutionStep[] = [];
    const dryRun = input.dryRun === true;
    const prefix = dryRun ? '[dry-run] ' : '';

    for (const error of parsed.errors) {
      steps.push({
        id: 'command-parse-error',
        raw: error.raw || 'command',
        canonical: '',
        status: 'error',
        detail:
          error.code === 'empty-command'
            ? 'Command chain is empty.'
            : `Unknown command token at position ${error.index + 1}.`,
      });
    }

    for (const step of parsed.steps) {
      if (
        !dryRun &&
        input.actorId === 'delegate' &&
        DELEGATE_BLOCKED_STEPS.has(step.id)
      ) {
        steps.push({
          id: step.id,
          raw: step.raw,
          canonical: step.canonical,
          status: 'error',
          detail: 'Blocked by command policy for delegate actors.',
        });
        continue;
      }

      if (step.id === 'resolve-next-action') {
        const action = await resolveNextAction();
        steps.push({
          id: step.id,
          raw: step.raw,
          canonical: step.canonical,
          status: 'ok',
          detail: `${prefix}${action.title}`,
          route: action.route,
        });
        continue;
      }

      if (step.id === 'run-close-weekly') {
        if (dryRun) {
          steps.push({
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'ok',
            detail: `${prefix}Would run weekly close routine.`,
          });
          continue;
        }

        const run = await runCloseRoutine('weekly');
        steps.push({
          id: step.id,
          raw: step.raw,
          canonical: step.canonical,
          status: 'ok',
          detail: `${prefix}Weekly close run ${run.id} (${run.exceptionCount} exceptions).`,
        });
        continue;
      }

      if (step.id === 'run-close-monthly') {
        if (dryRun) {
          steps.push({
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'ok',
            detail: `${prefix}Would run monthly close routine.`,
          });
          continue;
        }

        const run = await runCloseRoutine('monthly');
        steps.push({
          id: step.id,
          raw: step.raw,
          canonical: step.canonical,
          status: 'ok',
          detail: `${prefix}Monthly close run ${run.id} (${run.exceptionCount} exceptions).`,
        });
        continue;
      }

      if (step.id === 'create-default-playbook') {
        if (dryRun) {
          steps.push({
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'ok',
            detail: `${prefix}Would create default weekly triage playbook.`,
          });
          continue;
        }

        const playbook = await createPlaybook({
          name: 'Weekly Triage Autopilot',
          description: 'Created from command chain executor.',
          commands: [
            { verb: 'resolve-next-action', lane: 'triage' },
            { verb: 'open-expiring-contracts', window_days: 30 },
            { verb: 'run-close', period: 'weekly' },
          ],
        });
        steps.push({
          id: step.id,
          raw: step.raw,
          canonical: step.canonical,
          status: 'ok',
          detail: `${prefix}Created playbook ${playbook.name}.`,
        });
        continue;
      }

      if (step.id === 'run-first-playbook') {
        const first = (await listPlaybooks())[0];
        if (!first) {
          steps.push({
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'error',
            detail: `${prefix}No playbook available to run.`,
          });
          continue;
        }

        if (dryRun) {
          steps.push({
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'ok',
            detail: `${prefix}Would run playbook ${first.name}.`,
          });
          continue;
        }

        const run = await runPlaybook(
          first.id,
          true,
          input.actorId || 'owner',
          input.sourceSurface || 'unknown',
        );
        if (!run) {
          steps.push({
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'error',
            detail: `${prefix}Playbook ${first.id} not found.`,
          });
          continue;
        }

        steps.push({
          id: step.id,
          raw: step.raw,
          canonical: step.canonical,
          status: 'ok',
          detail: `${prefix}Playbook run ${run.id} (${run.executedSteps} steps).`,
        });
        continue;
      }

      if (step.id === 'open-expiring-contracts') {
        steps.push({
          id: step.id,
          raw: step.raw,
          canonical: step.canonical,
          status: 'ok',
          detail: `${prefix}Opened expiring contracts lane.`,
          route: '/contracts?filter=expiring',
        });
        continue;
      }

      if (step.id === 'assign-expiring-contracts-lane') {
        if (dryRun) {
          steps.push({
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'ok',
            detail: `${prefix}Would assign expiring-contract renegotiation lane.`,
          });
          continue;
        }

        const lane = await assignDelegateLane({
          title: 'Renegotiate expiring contracts',
          assignee: input.assignee || 'delegate',
          assignedBy: 'owner',
          actorId: input.actorId || 'owner',
          priority: 'high',
          payload: {
            source: 'workflow.execute-chain',
          },
        });
        steps.push({
          id: step.id,
          raw: step.raw,
          canonical: step.canonical,
          status: 'ok',
          detail: `${prefix}Assigned lane ${lane.title}.`,
        });
        continue;
      }

      if (step.id === 'open-urgent-review') {
        steps.push({
          id: step.id,
          raw: step.raw,
          canonical: step.canonical,
          status: 'ok',
          detail: `${prefix}Opened urgent review lane.`,
          route: '/review?priority=urgent',
        });
        continue;
      }

      if (step.id === 'refresh-command-center') {
        await getMoneyPulse();
        steps.push({
          id: step.id,
          raw: step.raw,
          canonical: step.canonical,
          status: 'ok',
          detail: `${prefix}Refreshed command center data.`,
        });
      }
    }

    const run: WorkflowCommandExecution = {
      id: nanoid(),
      chain: input.chain,
      steps,
      errorCount: steps.filter(step => step.status === 'error').length,
      actorId: input.actorId || 'owner',
      sourceSurface: input.sourceSurface || 'unknown',
      dryRun,
      executedAtMs: Date.now(),
    };

    await repository.createWorkflowCommandRun(run);
    return run;
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
      lane => typeof lane.dueAtMs === 'number' && lane.dueAtMs <= now + 72 * 60 * 60 * 1000,
    );
    const staleAssignedLanes = openLanes.filter(
      lane => lane.status === 'assigned' && now - lane.updatedAtMs >= 48 * 60 * 60 * 1000,
    );
    const recentOutcomes = await repository.listActionOutcomes({ limit: 120 });
    const latestOutcomeByAction = new Map<string, ActionOutcome>();
    for (const outcome of recentOutcomes) {
      if (!latestOutcomeByAction.has(outcome.actionId)) {
        latestOutcomeByAction.set(outcome.actionId, outcome);
      }
    }

    const actions = [
      {
        id: 'focus-urgent-review',
        title: 'Clear urgent review queue',
        route: '/review?priority=urgent',
        score: state.urgentReviews * 100,
        reason: 'Urgent queue items carry highest immediate financial risk.',
      },
      {
        id: 'focus-expiring-contracts',
        title: 'Inspect expiring contracts',
        route: '/contracts?filter=expiring',
        score: state.expiringContracts * 85,
        reason: 'Contract deadlines create time-sensitive spend outcomes.',
      },
      {
        id: 'focus-close-routine',
        title: 'Run weekly close',
        route: '/ops',
        score: Math.max(20, state.pendingReviews * 8),
        reason: 'Close loop compresses unresolved manual operations.',
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
      },
    ].map(action => {
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
    return repository.recordActionOutcome({
      id: nanoid(),
      actionId: input.actionId,
      outcome: input.outcome,
      notes: input.notes,
      recordedAtMs: Date.now(),
    });
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

  async function listOpsActivity(input?: {
    limit?: number;
    kinds?: OpsActivityEvent['kind'][];
    severities?: OpsActivityEvent['severity'][];
  }): Promise<OpsActivityEvent[]> {
    const limit = Math.max(1, Math.min(input?.limit ?? 60, 250));
    const fetchLimit = Math.max(40, Math.min(limit * 4, 500));
    const now = Date.now();

    const [
      commandRuns,
      playbookRuns,
      closeRuns,
      outcomes,
      lanes,
      scenarioBranches,
      egressAudit,
    ] = await Promise.all([
      repository.listWorkflowCommandRuns(fetchLimit),
      repository.listPlaybookRuns(fetchLimit),
      repository.listCloseRuns(fetchLimit),
      repository.listActionOutcomes({ limit: fetchLimit }),
      repository.listDelegateLanes(fetchLimit),
      repository.listScenarioBranches(),
      repository.listEgressAudit(fetchLimit),
    ]);

    const events: OpsActivityEvent[] = [];

    for (const run of commandRuns) {
      events.push({
        id: `command-run-${run.id}`,
        kind: 'workflow-command-run',
        title: run.errorCount > 0 ? 'Command chain reported errors' : 'Command chain executed',
        detail: `${run.chain} (${run.steps.length} steps, ${run.errorCount} error(s), actor ${run.actorId}${
          run.dryRun ? ', dry-run' : ''
        })`,
        route: run.steps.find(step => typeof step.route === 'string')?.route,
        severity: run.errorCount > 0 ? 'critical' : 'info',
        createdAtMs: run.executedAtMs,
        meta: {
          runId: run.id,
          actorId: run.actorId,
          sourceSurface: run.sourceSurface,
          dryRun: run.dryRun,
          errorCount: run.errorCount,
        },
      });
    }

    for (const run of playbookRuns) {
      events.push({
        id: `playbook-run-${run.id}`,
        kind: 'workflow-playbook-run',
        title: `Playbook run: ${run.dryRun ? 'dry-run' : 'live'}`,
        detail: `${run.executedSteps} step(s), ${run.errorCount} error(s), actor ${run.actorId}`,
        severity: run.errorCount > 0 ? 'critical' : 'info',
        createdAtMs: run.createdAtMs,
        meta: {
          runId: run.id,
          playbookId: run.playbookId,
          chain: run.chain,
          sourceSurface: run.sourceSurface,
          errorCount: run.errorCount,
        },
      });
    }

    for (const run of closeRuns) {
      events.push({
        id: `close-run-${run.id}`,
        kind: 'workflow-close-run',
        title: `${run.period === 'weekly' ? 'Weekly' : 'Monthly'} close routine executed`,
        detail: `${run.exceptionCount} exception(s), ${run.summary.pendingReviews} pending review(s), ${run.summary.expiringContracts} expiring contract(s).`,
        severity: run.exceptionCount > 0 ? 'warn' : 'info',
        createdAtMs: run.createdAtMs,
        meta: {
          runId: run.id,
          period: run.period,
          exceptionCount: run.exceptionCount,
        },
      });
    }

    for (const outcome of outcomes) {
      events.push({
        id: `focus-outcome-${outcome.id}`,
        kind: 'focus-action-outcome',
        title: `Focus outcome: ${outcome.outcome}`,
        detail: `${outcome.actionId}${outcome.notes ? ` - ${outcome.notes}` : ''}`,
        severity: outcomeSeverity(outcome.outcome),
        createdAtMs: outcome.recordedAtMs,
        meta: {
          outcomeId: outcome.id,
          actionId: outcome.actionId,
          outcome: outcome.outcome,
        },
      });
    }

    for (const lane of lanes) {
      const severity = laneSeverity(lane, now);
      events.push({
        id: `delegate-lane-${lane.id}`,
        kind: 'delegate-lane',
        title: `Delegate lane ${lane.status}: ${lane.title}`,
        detail: `${lane.assignee} (${lane.priority})${lane.dueAtMs ? ` due ${new Date(lane.dueAtMs).toISOString()}` : ''}`,
        route: '/ops#delegate-lanes',
        severity,
        createdAtMs: lane.updatedAtMs,
        meta: {
          laneId: lane.id,
          status: lane.status,
          priority: lane.priority,
          assignee: lane.assignee,
          dueAtMs: lane.dueAtMs,
        },
      });
    }

    for (const branch of scenarioBranches) {
      if (branch.status !== 'adopted') {
        continue;
      }
      const createdAtMs = branch.adoptedAtMs || branch.updatedAtMs;
      events.push({
        id: `scenario-adoption-${branch.id}`,
        kind: 'scenario-adoption',
        title: `Scenario adopted: ${branch.name}`,
        detail: `Lineage baseline ${branch.baseBranchId || 'root'}.`,
        route: '/ops#spatial-twin',
        severity: 'info',
        createdAtMs,
        meta: {
          branchId: branch.id,
          baseBranchId: branch.baseBranchId,
          adoptedAtMs: branch.adoptedAtMs,
        },
      });
    }

    for (const audit of egressAudit) {
      const severity: OpsActivityEvent['severity'] =
        audit.eventType.includes('blocked') || audit.eventType.includes('violation')
          ? 'critical'
          : audit.eventType.includes('warn')
            ? 'warn'
            : 'info';
      const provider =
        typeof audit.provider === 'string' && audit.provider.length > 0
          ? ` (${audit.provider})`
          : '';

      events.push({
        id: `policy-egress-${audit.id}`,
        kind: 'policy-egress',
        title: `Policy event: ${audit.eventType}${provider}`,
        detail:
          typeof audit.payload === 'object' && audit.payload
            ? JSON.stringify(audit.payload)
            : 'No payload attached.',
        route: '/ops#policy',
        severity,
        createdAtMs: audit.createdAtMs,
        meta: {
          auditId: audit.id,
          eventType: audit.eventType,
          provider: audit.provider,
        },
      });
    }

    const kindFilter =
      input?.kinds && input.kinds.length > 0 ? new Set(input.kinds) : null;
    const severityFilter =
      input?.severities && input.severities.length > 0
        ? new Set(input.severities)
        : null;

    return events
      .filter(event => {
        if (kindFilter && !kindFilter.has(event.kind)) {
          return false;
        }
        if (severityFilter && !severityFilter.has(event.severity)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, limit);
  }

  async function listScenarioBranches(): Promise<ScenarioBranch[]> {
    return repository.listScenarioBranches();
  }

  async function createScenarioBranch(input: {
    name: string;
    baseBranchId?: string;
    notes?: string;
  }): Promise<ScenarioBranch> {
    const now = Date.now();
    const branch: ScenarioBranch = {
      id: nanoid(),
      name: input.name,
      status: 'draft',
      baseBranchId: input.baseBranchId,
      notes: input.notes,
      createdAtMs: now,
      updatedAtMs: now,
    };

    await repository.createScenarioBranch(branch);
    await queue.enqueue(
      queueJob('scenario.branch.created', {
        branchId: branch.id,
      }),
    );

    return branch;
  }

  async function listScenarioMutations(branchId: string): Promise<ScenarioMutation[]> {
    return repository.listScenarioMutations(branchId);
  }

  async function applyScenarioMutation(input: {
    branchId: string;
    mutationKind: string;
    payload: Record<string, unknown>;
  }): Promise<ScenarioMutation | null> {
    const mutation: ScenarioMutation = {
      id: nanoid(),
      branchId: input.branchId,
      kind: input.mutationKind,
      payload: input.payload,
      createdAtMs: Date.now(),
    };

    const created = await repository.addScenarioMutation(mutation);
    if (!created) return null;

    await queue.enqueue(
      queueJob('scenario.mutation.applied', {
        mutationId: created.id,
        branchId: created.branchId,
      }),
    );

    return created;
  }

  async function compareScenarioOutcomes(
    branchId: string,
    againstBranchId?: string,
  ): Promise<ScenarioComparison | null> {
    const primaryBranch = await repository.getScenarioBranchById(branchId);
    if (!primaryBranch) return null;

    const againstBranch = againstBranchId
      ? await repository.getScenarioBranchById(againstBranchId)
      : null;

    const summarize = async (id?: string) => {
      if (!id) {
        return { amountDelta: 0, riskDelta: 0 };
      }

      const mutations = await repository.listScenarioMutations(id);
      return mutations.reduce(
        (acc, mutation) => {
          const amountDelta = mutation.payload.amountDelta;
          const riskDelta = mutation.payload.riskDelta;

          acc.amountDelta += typeof amountDelta === 'number' ? amountDelta : 0;
          acc.riskDelta += typeof riskDelta === 'number' ? riskDelta : 0;
          return acc;
        },
        { amountDelta: 0, riskDelta: 0 },
      );
    };

    const primary = await summarize(primaryBranch.id);
    const against = await summarize(againstBranch?.id);

    return {
      primaryBranchId: primaryBranch.id,
      againstBranchId: againstBranch?.id,
      primary,
      against,
      diff: {
        amountDelta: primary.amountDelta - against.amountDelta,
        riskDelta: primary.riskDelta - against.riskDelta,
      },
    };
  }

  async function getScenarioLineage(
    branchId: string,
  ): Promise<ScenarioLineage | null> {
    const branches = await repository.listScenarioBranches();
    const byId = new Map(branches.map(branch => [branch.id, branch]));
    const target = byId.get(branchId);
    if (!target) return null;

    const visited = new Set<string>();
    const reverse: ScenarioLineageNode[] = [];
    let current: ScenarioBranch | undefined = target;
    let hasCycle = false;

    while (current) {
      if (visited.has(current.id)) {
        hasCycle = true;
        break;
      }
      visited.add(current.id);
      reverse.push({
        branchId: current.id,
        name: current.name,
        status: current.status,
        adoptedAtMs: current.adoptedAtMs,
      });

      if (!current.baseBranchId) {
        break;
      }
      current = byId.get(current.baseBranchId);
      if (!current) {
        break;
      }
    }

    return {
      branchId,
      nodes: reverse.reverse(),
      hasCycle,
    };
  }

  async function getScenarioAdoptionCheck(input: {
    branchId: string;
    againstBranchId?: string;
  }): Promise<ScenarioAdoptionCheck | null> {
    const branch = await repository.getScenarioBranchById(input.branchId);
    if (!branch) return null;

    let againstBranchId = input.againstBranchId;
    if (!againstBranchId) {
      const adoptedBaseline = (await repository.listScenarioBranches())
        .filter(candidate => candidate.status === 'adopted' && candidate.id !== branch.id)
        .sort(
          (a, b) =>
            (b.adoptedAtMs || 0) - (a.adoptedAtMs || 0) ||
            b.updatedAtMs - a.updatedAtMs,
        )[0];
      againstBranchId = adoptedBaseline?.id;
    }

    const comparison = await compareScenarioOutcomes(branch.id, againstBranchId);
    if (!comparison) return null;

    const mutations = await repository.listScenarioMutations(branch.id);
    const lineage = await getScenarioLineage(branch.id);
    if (!lineage) return null;

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (branch.status === 'adopted') {
      blockers.push('Branch is already adopted.');
    }
    if (lineage.hasCycle) {
      blockers.push('Scenario lineage cycle detected.');
    }
    if (mutations.length === 0) {
      warnings.push('Branch has no mutations; adoption has no measurable change.');
    }
    if (lineage.nodes.length >= 6) {
      warnings.push(
        `Lineage depth is ${lineage.nodes.length}, increasing rollback complexity.`,
      );
    }

    const amountDelta = comparison.diff.amountDelta;
    const riskDelta = comparison.diff.riskDelta;
    if (riskDelta >= 6) {
      warnings.push(`Risk delta is elevated (${riskDelta}).`);
    }
    if (riskDelta >= 10) {
      blockers.push(`Risk delta is too high for safe adoption (${riskDelta}).`);
    }
    if (amountDelta <= -500) {
      warnings.push(`Projected cashflow delta is negative (${amountDelta}).`);
    }
    if (amountDelta <= -2000) {
      blockers.push(`Projected cashflow downside exceeds threshold (${amountDelta}).`);
    }

    const riskScoreRaw = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          Math.abs(riskDelta) * 8 +
            (amountDelta < 0 ? Math.min(45, Math.abs(amountDelta) / 80) : 0) +
            mutations.length * 2 +
            Math.max(0, lineage.nodes.length - 1) * 3,
        ),
      ),
    );
    const riskScore = Math.max(
      riskScoreRaw,
      blockers.length * 25 + warnings.length * 10,
    );
    const canAdopt = blockers.length === 0;

    return {
      branchId: branch.id,
      againstBranchId: comparison.againstBranchId,
      canAdopt,
      riskScore,
      blockers,
      warnings,
      summary: canAdopt
        ? `Adoption ready with risk score ${riskScore}.`
        : `Adoption blocked with risk score ${riskScore}.`,
      comparison,
      mutationCount: mutations.length,
      lineageDepth: lineage.nodes.length,
      checkedAtMs: Date.now(),
    };
  }

  async function adoptScenarioBranch(input: {
    branchId: string;
    force?: boolean;
    actorId?: string;
    againstBranchId?: string;
  }): Promise<
    | { ok: true; branch: ScenarioBranch; check: ScenarioAdoptionCheck }
    | { ok: false; error: 'branch-not-found' | 'adoption-blocked'; check?: ScenarioAdoptionCheck }
  > {
    const check = await getScenarioAdoptionCheck({
      branchId: input.branchId,
      againstBranchId: input.againstBranchId,
    });
    if (!check) {
      return {
        ok: false,
        error: 'branch-not-found',
      };
    }
    if (!check.canAdopt && !input.force) {
      return {
        ok: false,
        error: 'adoption-blocked',
        check,
      };
    }

    const adoptedAtMs = Date.now();
    const branch = await repository.adoptScenarioBranch(input.branchId, adoptedAtMs);
    if (!branch) {
      return {
        ok: false,
        error: 'branch-not-found',
      };
    }

    await queue.enqueue(
      queueJob('scenario.branch.adopted', {
        branchId: input.branchId,
        actorId: input.actorId || 'owner',
        force: !!input.force,
        riskScore: check.riskScore,
        blockerCount: check.blockers.length,
        warningCount: check.warnings.length,
      }),
    );

    return {
      ok: true,
      branch,
      check,
    };
  }

  async function listDelegateLanes(input?: {
    limit?: number;
    status?: DelegateLane['status'];
    assignee?: string;
    assignedBy?: string;
    priority?: DelegateLane['priority'];
  }): Promise<DelegateLane[]> {
    const limit = Math.max(1, Math.min(input?.limit ?? 50, 200));
    return repository.listDelegateLanes(limit, {
      status: input?.status,
      assignee: input?.assignee,
      assignedBy: input?.assignedBy,
      priority: input?.priority,
    });
  }

  async function listDelegateLaneEvents(input: {
    laneId: string;
    limit?: number;
  }): Promise<DelegateLaneEvent[]> {
    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    return repository.listDelegateLaneEvents(input.laneId, limit);
  }

  async function assignDelegateLane(input: {
    title: string;
    assignee: string;
    assignedBy: string;
    payload: Record<string, unknown>;
    priority?: DelegateLane['priority'];
    dueAtMs?: number;
    actorId?: string;
  }): Promise<DelegateLane> {
    const now = Date.now();
    const lane: DelegateLane = {
      id: nanoid(),
      title: input.title,
      priority: input.priority || 'normal',
      status: 'assigned',
      assignee: input.assignee,
      assignedBy: input.assignedBy,
      payload: input.payload,
      createdAtMs: now,
      updatedAtMs: now,
      dueAtMs: input.dueAtMs,
    };

    await repository.createDelegateLane(lane);
    await repository.createDelegateLaneEvent({
      id: nanoid(),
      laneId: lane.id,
      type: 'assigned',
      actorId: input.actorId || input.assignedBy,
      message: 'Lane assigned.',
      payload: {
        title: lane.title,
        assignee: lane.assignee,
        priority: lane.priority,
        dueAtMs: lane.dueAtMs,
      },
      createdAtMs: now,
    });
    await queue.enqueue(
      queueJob('delegate.lane.assigned', {
        laneId: lane.id,
        assignee: lane.assignee,
        priority: lane.priority,
      }),
    );

    return lane;
  }

  async function transitionDelegateLane(input: {
    laneId: string;
    status: DelegateLane['status'];
    actorId: string;
    message?: string;
  }): Promise<
    | { ok: true; lane: DelegateLane }
    | { ok: false; error: 'lane-not-found' | 'invalid-lane-transition' }
  > {
    const lane = await repository.getDelegateLaneById(input.laneId);
    if (!lane) return { ok: false, error: 'lane-not-found' };

    if (lane.status !== input.status) {
      const allowed = DELEGATE_ALLOWED_TRANSITIONS[lane.status];
      if (!allowed.includes(input.status)) {
        return { ok: false, error: 'invalid-lane-transition' };
      }
    }

    const now = Date.now();
    const updated: DelegateLane = {
      ...lane,
      status: input.status,
      updatedAtMs: now,
      acceptedAtMs: input.status === 'accepted' ? now : lane.acceptedAtMs,
      completedAtMs: input.status === 'completed' ? now : lane.completedAtMs,
      rejectedAtMs: input.status === 'rejected' ? now : lane.rejectedAtMs,
    };

    await repository.updateDelegateLane(updated);
    await repository.createDelegateLaneEvent({
      id: nanoid(),
      laneId: input.laneId,
      type:
        input.status === 'assigned' && lane.status !== 'assigned'
          ? 'reopened'
          : input.status,
      actorId: input.actorId,
      message: input.message,
      payload: {
        fromStatus: lane.status,
        toStatus: input.status,
      },
      createdAtMs: now,
    });
    await queue.enqueue(
      queueJob('delegate.lane.transitioned', {
        laneId: input.laneId,
        status: input.status,
        actorId: input.actorId,
      }),
    );

    return { ok: true, lane: updated };
  }

  async function commentDelegateLane(input: {
    laneId: string;
    actorId: string;
    message: string;
    payload?: Record<string, unknown>;
  }): Promise<DelegateLaneEvent | null> {
    const lane = await repository.getDelegateLaneById(input.laneId);
    if (!lane) return null;

    const now = Date.now();
    const updatedLane: DelegateLane = {
      ...lane,
      updatedAtMs: now,
    };
    await repository.updateDelegateLane(updatedLane);

    const event = await repository.createDelegateLaneEvent({
      id: nanoid(),
      laneId: input.laneId,
      type: 'comment',
      actorId: input.actorId,
      message: input.message,
      payload: input.payload,
      createdAtMs: now,
    });

    await queue.enqueue(
      queueJob('delegate.lane.commented', {
        laneId: input.laneId,
        actorId: input.actorId,
      }),
    );

    return event;
  }

  async function getEgressPolicy(): Promise<EgressPolicy> {
    return repository.getEgressPolicy();
  }

  async function setEgressPolicy(policy: EgressPolicy): Promise<EgressPolicy> {
    const updatedPolicy = await repository.setEgressPolicy(policy);

    await repository.recordEgressAudit({
      id: nanoid(),
      eventType: 'policy-updated',
      payload: {
        allowCloud: updatedPolicy.allowCloud,
        allowedProviders: updatedPolicy.allowedProviders,
        redactionMode: updatedPolicy.redactionMode,
      },
      createdAtMs: Date.now(),
    });

    return updatedPolicy;
  }

  async function listEgressAudit(limit: number): Promise<EgressAuditEntry[]> {
    return repository.listEgressAudit(limit);
  }

  async function recordEgressAudit(input: {
    eventType: string;
    provider?: string;
    payload?: Record<string, unknown>;
  }): Promise<EgressAuditEntry> {
    return repository.recordEgressAudit({
      id: nanoid(),
      eventType: input.eventType,
      provider: input.provider,
      payload: input.payload,
      createdAtMs: Date.now(),
    });
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

  async function learnCorrection(input: {
    input: Record<string, unknown>;
    correctOutput: Record<string, unknown>;
  }) {
    const correction = await repository.createCorrection({
      id: nanoid(),
      input: input.input,
      correctOutput: input.correctOutput,
      createdAtMs: Date.now(),
    });

    await queue.enqueue(
      queueJob('intelligence.correction.learned', {
        correctionId: correction.id,
      }),
    );

    return correction;
  }

  async function submitLedgerCommand(input: {
    workspaceId: string;
    actorId: string;
    commandType: string;
    aggregateId: string;
    aggregateType: string;
    payload: Record<string, unknown>;
  }): Promise<LedgerEvent> {
    const event: LedgerEvent = {
      eventId: nanoid(),
      workspaceId: input.workspaceId,
      aggregateId: input.aggregateId,
      aggregateType: input.aggregateType,
      type: input.commandType,
      payload: input.payload,
      actorId: input.actorId,
      occurredAtMs: Date.now(),
      version: 0,
    };

    const committedEvent = await repository.appendLedgerEvent(event);
    await queue.enqueue(
      queueJob('ledger.command.submitted', {
        eventId: committedEvent.eventId,
        workspaceId: committedEvent.workspaceId,
        commandType: committedEvent.type,
        version: committedEvent.version,
      }),
    );

    return committedEvent;
  }

  async function streamLedgerEvents(input: {
    workspaceId: string;
    cursor?: string;
    limit: number;
  }) {
    return repository.streamLedgerEvents(input);
  }

  async function getProjectionSnapshot(input: {
    workspaceId: string;
    projectionName: string;
  }) {
    const state = await repository.getOpsState();
    const recentEvents = await repository.streamLedgerEvents({
      workspaceId: input.workspaceId,
      limit: 20,
    });

    return {
      snapshot: {
        projectionName: input.projectionName,
        pendingReviews: state.pendingReviews,
        urgentReviews: state.urgentReviews,
        expiringContracts: state.expiringContracts,
        recentEventCount: recentEvents.events.length,
      },
      generatedAtMs: Date.now(),
    };
  }

  async function getRuntimeMetrics() {
    const queueSize = await queue.size();
    const queueInFlight = await queue.inFlightSize();
    const playbooks = await repository.listPlaybooks();
    const lanes = await repository.listDelegateLanes(1000);
    const corrections = await repository.listCorrections(1000);
    const branches = await repository.listScenarioBranches();

    return {
      repositoryKind: repository.kind,
      queueKind: queue.kind,
      queueSize,
      queueInFlight,
      playbooks: playbooks.length,
      delegateLanes: lanes.length,
      corrections: corrections.length,
      scenarioBranches: branches.length,
    };
  }

  return {
    repository,
    queue,
    resolveNextAction,
    getMoneyPulse,
    getNarrativePulse,
    listPlaybooks,
    listPlaybookRuns,
    listWorkflowCommandRuns,
    createPlaybook,
    runPlaybook,
    replayPlaybookRun,
    runCloseRoutine,
    listCloseRuns,
    applyBatchPolicy,
    executeWorkflowCommandChain,
    listOpsActivity,
    getAdaptiveFocusPanel,
    recordActionOutcome,
    listActionOutcomes,
    listScenarioBranches,
    createScenarioBranch,
    listScenarioMutations,
    applyScenarioMutation,
    compareScenarioOutcomes,
    getScenarioAdoptionCheck,
    getScenarioLineage,
    adoptScenarioBranch,
    listDelegateLanes,
    listDelegateLaneEvents,
    assignDelegateLane,
    transitionDelegateLane,
    commentDelegateLane,
    getEgressPolicy,
    setEgressPolicy,
    listEgressAudit,
    recordEgressAudit,
    recommend,
    explain,
    classify,
    forecast,
    learnCorrection,
    submitLedgerCommand,
    streamLedgerEvents,
    getProjectionSnapshot,
    getRuntimeMetrics,
  };
}
