import { useCallback, useEffect, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

type HandlerError = { error: string };
type HandlerResult<T> = T | HandlerError;

type MoneyPulse = {
  generated_at: string;
  pending_reviews: number;
  urgent_reviews: number;
  active_contracts: number;
  monthly_commitment: number;
  top_actions: Array<{ id: string; title: string; route: string; urgency: string }>;
};

type AdaptiveFocus = {
  generated_at: string;
  indicators: {
    urgent_review_count: number;
    pending_review_count: number;
    expiring_contract_count: number;
  };
  suggested_actions: Array<{ id: string; title: string; route: string; score: number; reason: string }>;
};

async function callHandler<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<HandlerResult<T>> {
  return (
    send as unknown as (
      handlerName: string,
      handlerArgs: Record<string, unknown>,
    ) => Promise<HandlerResult<T>>
  )(name, args);
}

function hasError<T>(value: HandlerResult<T>): value is HandlerError {
  return !!value && typeof value === 'object' && 'error' in value;
}

export function useOpsCommandCenter() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moneyPulse, setMoneyPulse] = useState<MoneyPulse | null>(null);
  const [adaptiveFocus, setAdaptiveFocus] = useState<AdaptiveFocus | null>(null);
  const [playbooks, setPlaybooks] = useState<Array<Record<string, unknown>>>([]);
  const [lanes, setLanes] = useState<Array<Record<string, unknown>>>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [pulse, focus, workflowPlaybooks, delegateLanes] = await Promise.all([
        callHandler<MoneyPulse>('workflow-money-pulse'),
        callHandler<AdaptiveFocus>('focus-adaptive-panel'),
        callHandler<Array<Record<string, unknown>>>('workflow-playbook-list'),
        callHandler<Array<Record<string, unknown>>>('delegate-list-lanes'),
      ]);

      if (
        hasError(pulse) ||
        hasError(focus) ||
        hasError(workflowPlaybooks) ||
        hasError(delegateLanes)
      ) {
        const firstError = hasError(pulse)
          ? pulse.error
          : hasError(focus)
            ? focus.error
            : hasError(workflowPlaybooks)
              ? workflowPlaybooks.error
              : hasError(delegateLanes)
                ? delegateLanes.error
                : 'unknown-error';
        setError(String(firstError));
      } else {
        setMoneyPulse(pulse);
        setAdaptiveFocus(focus);
        setPlaybooks(Array.isArray(workflowPlaybooks) ? workflowPlaybooks : []);
        setLanes(Array.isArray(delegateLanes) ? delegateLanes : []);
      }
    } catch (err) {
      setError((err as Error).message || 'unknown-error');
    } finally {
      setLoading(false);
    }
  }, []);

  const resolveNextAction = useCallback(async () => {
    return callHandler<{
      route?: string;
      title?: string;
      action_type?: string;
      payload?: unknown;
    }>('workflow-resolve-next-action');
  }, []);

  const runCloseRoutine = useCallback(
    async (period: 'weekly' | 'monthly') => {
      const result = await callHandler<Record<string, unknown>>(
        'workflow-run-close-routine',
        { period },
      );
      await refresh();
      return result;
    },
    [refresh],
  );

  const runPlaybook = useCallback(
    async (id: string, dryRun = true) => {
      const result = await callHandler<Record<string, unknown>>(
        'workflow-run-playbook',
        { id, dry_run: dryRun },
      );
      await refresh();
      return result;
    },
    [refresh],
  );

  const createPlaybook = useCallback(
    async (name: string, commands: Array<Record<string, unknown>>) => {
      const result = await callHandler<Record<string, unknown>>(
        'workflow-playbook-create',
        {
          name,
          commands,
          description: 'Created from Ops Command Center',
        },
      );
      await refresh();
      return result;
    },
    [refresh],
  );

  const assignLane = useCallback(
    async (title: string, assignee?: string) => {
      const result = await callHandler<Record<string, unknown>>(
        'delegate-assign-lane',
        {
          title,
          assignee,
          assigned_by: 'owner',
          payload: { source: 'ops-command-center' },
        },
      );
      await refresh();
      return result;
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    loading,
    error,
    moneyPulse,
    adaptiveFocus,
    playbooks,
    lanes,
    refresh,
    resolveNextAction,
    runCloseRoutine,
    runPlaybook,
    createPlaybook,
    assignLane,
  };
}
