import { useEffect, useMemo, useState } from 'react';
import { Trans } from 'react-i18next';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';
import type {
  ActionOutcome,
  ExecutionMode,
  FocusAction,
  GuardrailProfile,
} from '../../core/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type AdaptiveFocusRailProps = {
  onRoute: (route: string) => void;
  onStatus?: (status: string) => void;
};

function normalizeScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function messageFromError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${fallback}: ${error.message}`;
  }
  return fallback;
}

function formatOutcome(outcome: string): string {
  if (!outcome) {
    return 'none';
  }
  return outcome.replaceAll('-', ' ');
}

function isOutcomeRecent(outcome: ActionOutcome): boolean {
  const ageMs = Date.now() - outcome.recordedAtMs;
  return ageMs <= 3 * 24 * 60 * 60 * 1000;
}

type FocusActionExecutionPlan = {
  chain: string;
  assignee: string;
  fallbackRoute: string;
  defaultExecutionMode: ExecutionMode;
  defaultGuardrailProfile: GuardrailProfile;
  defaultRollbackWindowMinutes: number;
};

function clampRollbackWindow(minutes: number): number {
  return Math.max(1, Math.min(1440, Math.trunc(minutes || 60)));
}

function executionPlanForAction(action: FocusAction): FocusActionExecutionPlan {
  if (
    typeof action.recommendedChain === 'string' &&
    action.recommendedChain.trim()
  ) {
    return {
      chain: action.recommendedChain.trim(),
      assignee: action.recommendedAssignee || 'delegate',
      fallbackRoute: action.route,
      defaultExecutionMode: action.recommendedExecutionMode || 'dry-run',
      defaultGuardrailProfile: action.recommendedGuardrailProfile || 'balanced',
      defaultRollbackWindowMinutes: clampRollbackWindow(
        action.recommendedRollbackWindowMinutes || 60,
      ),
    };
  }

  if (action.id === 'focus-urgent-review') {
    return {
      chain: 'triage -> open-review',
      assignee: 'delegate',
      fallbackRoute: '/review?priority=urgent',
      defaultExecutionMode: 'live',
      defaultGuardrailProfile: 'strict',
      defaultRollbackWindowMinutes: 120,
    };
  }
  if (action.id === 'focus-expiring-contracts') {
    return {
      chain:
        'triage -> open-expiring-contracts -> assign-expiring-contracts-lane',
      assignee: 'delegate',
      fallbackRoute: '/contracts?filter=expiring',
      defaultExecutionMode: 'live',
      defaultGuardrailProfile: 'balanced',
      defaultRollbackWindowMinutes: 180,
    };
  }
  if (action.id === 'focus-close-routine') {
    return {
      chain: 'triage -> close-weekly -> refresh',
      assignee: 'delegate',
      fallbackRoute: '/ops#close-loop',
      defaultExecutionMode: 'live',
      defaultGuardrailProfile: 'strict',
      defaultRollbackWindowMinutes: 240,
    };
  }
  if (action.id === 'focus-delegate-lanes-due') {
    return {
      chain: 'triage -> delegate-triage-batch -> apply-batch-policy',
      assignee: 'delegate',
      fallbackRoute: '/ops#delegate-lanes',
      defaultExecutionMode: 'live',
      defaultGuardrailProfile: 'balanced',
      defaultRollbackWindowMinutes: 90,
    };
  }
  if (action.id === 'focus-delegate-lanes-stale') {
    return {
      chain:
        'triage -> escalate-stale-lanes -> delegate-triage-batch -> apply-batch-policy',
      assignee: 'delegate',
      fallbackRoute: '/ops#delegate-lanes',
      defaultExecutionMode: 'live',
      defaultGuardrailProfile: 'strict',
      defaultRollbackWindowMinutes: 90,
    };
  }
  return {
    chain: 'triage -> refresh',
    assignee: 'delegate',
    fallbackRoute: action.route,
    defaultExecutionMode: 'dry-run',
    defaultGuardrailProfile: 'balanced',
    defaultRollbackWindowMinutes: 60,
  };
}

export function AdaptiveFocusRail({
  onRoute,
  onStatus,
}: AdaptiveFocusRailProps) {
  const queryClient = useQueryClient();
  const [selectedActionId, setSelectedActionId] = useState('');
  const [note, setNote] = useState('');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('dry-run');
  const [guardrailProfile, setGuardrailProfile] =
    useState<GuardrailProfile>('balanced');
  const [rollbackWindowMinutes, setRollbackWindowMinutes] = useState(60);

  const focus = useQuery({
    queryKey: ['focus-panel'],
    queryFn: apiClient.getFocusPanel,
    refetchInterval: 20_000,
  });

  const outcomes = useQuery({
    queryKey: ['focus-outcomes'],
    queryFn: () => apiClient.listActionOutcomes({ limit: 120 }),
    refetchInterval: 20_000,
  });

  const rankedActions = useMemo(
    () => (focus.data?.actions || []).slice().sort((a, b) => b.score - a.score),
    [focus.data?.actions],
  );

  const latestOutcomeByAction = useMemo(() => {
    const map = new Map<string, ActionOutcome>();
    for (const outcome of outcomes.data || []) {
      if (!map.has(outcome.actionId)) {
        map.set(outcome.actionId, outcome);
      }
    }
    return map;
  }, [outcomes.data]);

  const selectedAction =
    rankedActions.find(action => action.id === selectedActionId) ||
    rankedActions[0];

  const selectedActionPlan = useMemo(
    () => (selectedAction ? executionPlanForAction(selectedAction) : null),
    [selectedAction],
  );

  useEffect(() => {
    if (!selectedActionPlan) {
      return;
    }
    setExecutionMode(selectedActionPlan.defaultExecutionMode);
    setGuardrailProfile(selectedActionPlan.defaultGuardrailProfile);
    setRollbackWindowMinutes(selectedActionPlan.defaultRollbackWindowMinutes);
  }, [selectedAction?.id, selectedActionPlan]);

  const selectedActionOutcomes = useMemo(
    () =>
      (outcomes.data || [])
        .filter(outcome => outcome.actionId === selectedAction?.id)
        .slice(0, 6),
    [outcomes.data, selectedAction?.id],
  );

  const recordOutcome = useMutation({
    mutationFn: async (input: {
      actionId: string;
      outcome: string;
      notes?: string;
    }) =>
      apiClient.recordActionOutcome(input.actionId, input.outcome, input.notes),
    onSuccess: async (_, input) => {
      if (onStatus) {
        onStatus(
          `Recorded "${formatOutcome(input.outcome)}" for ${input.actionId}.`,
        );
      }
      setNote('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['focus-panel'] }),
        queryClient.invalidateQueries({ queryKey: ['focus-outcomes'] }),
        queryClient.invalidateQueries({ queryKey: ['ops-activity'] }),
      ]);
    },
    onError: error => {
      if (onStatus) {
        onStatus(messageFromError(error, 'Record focus outcome failed'));
      }
    },
  });

  const acceptTopActions = useMutation({
    mutationFn: async (limit: number) => {
      const top = rankedActions.slice(0, limit);
      for (const action of top) {
        await apiClient.recordActionOutcome(
          action.id,
          'accepted',
          'bulk-accept-top',
        );
      }
      return top.length;
    },
    onSuccess: async acceptedCount => {
      if (onStatus) {
        onStatus(`Accepted top ${acceptedCount} focus actions.`);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['focus-panel'] }),
        queryClient.invalidateQueries({ queryKey: ['focus-outcomes'] }),
      ]);
    },
    onError: error => {
      if (onStatus) {
        onStatus(messageFromError(error, 'Bulk accept failed'));
      }
    },
  });

  const runResolveNext = useMutation({
    mutationFn: apiClient.resolveNextAction,
    onSuccess: action => {
      onRoute(action.route);
      if (onStatus) {
        onStatus(`Resolved next action: ${action.title}`);
      }
    },
    onError: error => {
      if (onStatus) {
        onStatus(messageFromError(error, 'Resolve next action failed'));
      }
    },
  });

  const executeSelectedAction = useMutation({
    mutationFn: async () => {
      if (!selectedAction || !selectedActionPlan) {
        throw new Error('No focus action selected');
      }
      const plan = selectedActionPlan;
      const run = await apiClient.executeCommandChain(
        plan.chain,
        plan.assignee,
        {
          executionMode,
          guardrailProfile,
          rollbackWindowMinutes,
          rollbackOnFailure: executionMode === 'live',
        },
      );
      return {
        actionTitle: selectedAction.title,
        plan,
        run,
      };
    },
    onSuccess: async ({ actionTitle, plan, run }) => {
      const nextRoute =
        run.steps.find(step => typeof step.route === 'string')?.route ||
        plan.fallbackRoute;
      onRoute(nextRoute);
      if (onStatus) {
        onStatus(
          `Executed focus action "${actionTitle}": ${run.status} (${run.errorCount} errors).`,
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['focus-panel'] }),
        queryClient.invalidateQueries({ queryKey: ['focus-outcomes'] }),
        queryClient.invalidateQueries({ queryKey: ['command-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['money-pulse'] }),
        queryClient.invalidateQueries({ queryKey: ['ops-activity'] }),
      ]);
    },
    onError: error => {
      if (onStatus) {
        onStatus(messageFromError(error, 'Focus action execution failed'));
      }
    },
  });

  const simulateSelectedAction = useMutation({
    mutationFn: async () => {
      if (!selectedAction || !selectedActionPlan) {
        throw new Error('No focus action selected');
      }
      const confidence = Math.max(
        0.5,
        Math.min(0.99, normalizeScore(selectedAction.score) / 100),
      );
      return apiClient.simulateScenarioBranch({
        label: `Focus ${selectedAction.title}`,
        chain: selectedActionPlan.chain,
        source: 'adaptive-focus',
        expectedImpact: selectedAction.expectedImpact || selectedAction.reason,
        confidence,
        notes: `Generated from adaptive focus action ${selectedAction.id}.`,
      });
    },
    onSuccess: async simulation => {
      onRoute('/ops#spatial-twin');
      if (onStatus) {
        onStatus(
          `Focus simulation ready: ${simulation.branch.name} (Δamount ${simulation.amountDelta}, Δrisk ${simulation.riskDelta}).`,
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['scenario-branches'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-mutations'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-compare'] }),
        queryClient.invalidateQueries({
          queryKey: ['scenario-adoption-check'],
        }),
        queryClient.invalidateQueries({ queryKey: ['scenario-lineage'] }),
      ]);
    },
    onError: error => {
      if (onStatus) {
        onStatus(messageFromError(error, 'Focus simulation failed'));
      }
    },
  });

  const applyOutcome = (outcome: 'accepted' | 'deferred' | 'rejected') => {
    if (!selectedAction) {
      return;
    }
    recordOutcome.mutate({
      actionId: selectedAction.id,
      outcome,
      notes: note.trim() || undefined,
    });
  };

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>
          <Trans>Adaptive Focus Workbench</Trans>
        </h2>
        <small>
          Ranked action lane with single-action depth and batch execution
          controls.
        </small>
      </header>

      {focus.isLoading ? <small>Loading focus panel...</small> : null}
      {focus.isError ? <small>Focus engine unavailable.</small> : null}

      <div className="fo-row">
        <Button
          variant="secondary"
          disabled={runResolveNext.isPending}
          onClick={() => runResolveNext.mutate()}
        >
          {runResolveNext.isPending ? 'Resolving...' : t('Resolve Next + Open')}
        </Button>
        <Button
          variant="secondary"
          disabled={acceptTopActions.isPending || rankedActions.length === 0}
          onClick={() => acceptTopActions.mutate(3)}
        >
          {acceptTopActions.isPending ? 'Applying...' : 'Accept Top 3'}
        </Button>
      </div>

      <div className="fo-row">
        <select
          aria-label="focus execution mode"
          className="fo-input"
          value={executionMode}
          onChange={event =>
            setExecutionMode(event.target.value as ExecutionMode)
          }
        >
          <option value="dry-run">dry-run</option>
          <option value="live">live</option>
        </select>
        <select
          aria-label="focus guardrail profile"
          className="fo-input"
          value={guardrailProfile}
          onChange={event =>
            setGuardrailProfile(event.target.value as GuardrailProfile)
          }
        >
          <option value="strict">strict</option>
          <option value="balanced">balanced</option>
          <option value="off">off</option>
        </select>
        <Input
          aria-label="focus rollback window minutes"
          className="w-[130px]"
          type="number"
          min={1}
          max={1440}
          value={rollbackWindowMinutes}
          onChange={event =>
            setRollbackWindowMinutes(
              Math.max(1, Math.min(1440, Number(event.target.value) || 60)),
            )
          }
        />
        <Button
          disabled={executeSelectedAction.isPending || !selectedAction}
          onClick={() => executeSelectedAction.mutate()}
        >
          {executeSelectedAction.isPending
            ? 'Executing...'
            : executionMode === 'live'
              ? t('Execute selected live')
              : t('Dry-run selected action')}
        </Button>
        <Button
          variant="secondary"
          disabled={simulateSelectedAction.isPending || !selectedAction}
          onClick={() => simulateSelectedAction.mutate()}
        >
          {simulateSelectedAction.isPending
            ? 'Simulating...'
            : t('Simulate selected in twin')}
        </Button>
      </div>

      <div className="fo-focus-workbench">
        <div className="fo-focus-list">
          {rankedActions.map(action => {
            const isSelected = selectedAction?.id === action.id;
            const latestOutcome = latestOutcomeByAction.get(action.id);
            const score = normalizeScore(action.score);

            return (
              <button
                key={action.id}
                className={`fo-focus-item ${isSelected ? 'fo-focus-item-selected' : ''}`}
                type="button"
                onClick={() => setSelectedActionId(action.id)}
              >
                <div className="fo-space-between">
                  <strong>{action.title}</strong>
                  <small>{score}</small>
                </div>
                <div className="fo-focus-score-track">
                  <span
                    className="fo-focus-score-fill"
                    style={{ width: `${score}%` }}
                  />
                </div>
                <small>{action.reason}</small>
                <small>
                  last:{' '}
                  {latestOutcome
                    ? formatOutcome(latestOutcome.outcome)
                    : 'none'}
                </small>
              </button>
            );
          })}
        </div>

        <div className="fo-focus-detail">
          {selectedAction ? (
            <>
              <div className="fo-space-between">
                <strong>{selectedAction.title}</strong>
                <small>score {normalizeScore(selectedAction.score)}</small>
              </div>
              <small>{selectedAction.reason}</small>
              <small>
                route: <code>{selectedAction.route}</code>
              </small>
              <small>
                chain:{' '}
                <code>{selectedActionPlan?.chain || 'triage -> refresh'}</code>
              </small>

              <Input
                value={note}
                onChange={event => setNote(event.target.value)}
                placeholder="Outcome note (optional)"
              />

              <div className="fo-row pt-1">
                <Button
                  variant="secondary"
                  onClick={() => onRoute(selectedAction.route)}
                ><Trans>
                  Open
                </Trans></Button>
                <Button
                  variant="secondary"
                  disabled={recordOutcome.isPending}
                  onClick={() => applyOutcome('accepted')}
                ><Trans>
                  Accept
                </Trans></Button>
                <Button
                  variant="secondary"
                  disabled={recordOutcome.isPending}
                  onClick={() => applyOutcome('deferred')}
                ><Trans>
                  Defer
                </Trans></Button>
                <Button
                  variant="secondary"
                  disabled={recordOutcome.isPending}
                  onClick={() => applyOutcome('rejected')}
                ><Trans>
                  Reject
                </Trans></Button>
              </div>

              <div className="fo-focus-outcomes">
                {selectedActionOutcomes.length === 0 ? (
                  <small className="fo-muted-line">
                    No recent outcomes for this action.
                  </small>
                ) : (
                  selectedActionOutcomes.map(outcome => (
                    <article
                      key={outcome.id}
                      className={`fo-focus-outcome ${isOutcomeRecent(outcome) ? 'fo-focus-outcome-recent' : ''}`}
                    >
                      <div className="fo-space-between">
                        <strong>{formatOutcome(outcome.outcome)}</strong>
                        <small>
                          {new Date(outcome.recordedAtMs).toLocaleTimeString()}
                        </small>
                      </div>
                      {outcome.notes ? <small>{outcome.notes}</small> : null}
                    </article>
                  ))
                )}
              </div>
            </>
          ) : (
            <small className="fo-muted-line">No focus actions available.</small>
          )}
        </div>
      </div>
    </section>
  );
}
