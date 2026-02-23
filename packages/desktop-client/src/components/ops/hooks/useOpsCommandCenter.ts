import { useCallback, useEffect, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

type HandlerError = { error: string };
type HandlerResult<T> = T | HandlerError;

type MoneyPulse = {
  generatedAtMs: number;
  pendingReviews: number;
  urgentReviews: number;
  expiringContracts: number;
};

type AdaptiveFocus = {
  generatedAtMs: number;
  actions: Array<{
    id: string;
    title: string;
    route: string;
    score: number;
    reason: string;
  }>;
};

type CommandChainRun = {
  id: string;
  chain: string;
  errorCount: number;
  actorId: string;
  sourceSurface: string;
  dryRun: boolean;
  executedAtMs: number;
  steps: Array<{
    id: string;
    raw: string;
    canonical: string;
    status: 'ok' | 'error';
    detail: string;
    route?: string;
  }>;
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
  const [commandRuns, setCommandRuns] = useState<CommandChainRun[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [pulse, focus, workflowPlaybooks, delegateLanes, runs] = await Promise.all([
        callHandler<MoneyPulse>('workflow-money-pulse'),
        callHandler<AdaptiveFocus>('focus-adaptive-panel'),
        callHandler<Array<Record<string, unknown>>>('workflow-playbook-list'),
        callHandler<Array<Record<string, unknown>>>('delegate-list-lanes'),
        callHandler<CommandChainRun[]>('workflow-command-runs', { limit: 20 }),
      ]);

      if (
        hasError(pulse) ||
        hasError(focus) ||
        hasError(workflowPlaybooks) ||
        hasError(delegateLanes) ||
        hasError(runs)
      ) {
        const firstError = hasError(pulse)
          ? pulse.error
          : hasError(focus)
            ? focus.error
            : hasError(workflowPlaybooks)
              ? workflowPlaybooks.error
              : hasError(delegateLanes)
                ? delegateLanes.error
                : hasError(runs)
                  ? runs.error
                : 'unknown-error';
        setError(String(firstError));
      } else {
        setMoneyPulse(pulse);
        setAdaptiveFocus(focus);
        setPlaybooks(Array.isArray(workflowPlaybooks) ? workflowPlaybooks : []);
        setLanes(Array.isArray(delegateLanes) ? delegateLanes : []);
        setCommandRuns(Array.isArray(runs) ? runs : []);
      }
    } catch (err) {
      setError((err as Error).message || 'unknown-error');
    } finally {
      setLoading(false);
    }
  }, []);

  const resolveNextAction = useCallback(async () => {
    return callHandler<{
      id?: string;
      route?: string;
      title?: string;
      confidence?: number;
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
        { id, dryRun },
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
          assignedBy: 'owner',
          payload: { source: 'ops-command-center' },
        },
      );
      await refresh();
      return result;
    },
    [refresh],
  );

  const executeCommandChain = useCallback(
    async (chain: string, assignee?: string, dryRun = false) => {
      const result = await callHandler<CommandChainRun>('workflow-execute-chain', {
        chain,
        assignee,
        dryRun,
      });
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
    commandRuns,
    refresh,
    resolveNextAction,
    runCloseRoutine,
    runPlaybook,
    createPlaybook,
    assignLane,
    executeCommandChain,
  };
}
