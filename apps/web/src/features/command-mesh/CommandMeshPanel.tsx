import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';

type CommandMeshPanelProps = {
  onRoute: (route: string) => void;
  onStatus: (status: string) => void;
};

type LogEntry = {
  id: string;
  step: string;
  status: 'ok' | 'error';
  detail: string;
};

function nextId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function CommandMeshPanel({ onRoute, onStatus }: CommandMeshPanelProps) {
  const queryClient = useQueryClient();
  const [command, setCommand] = useState('triage -> close-weekly');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (entry: Omit<LogEntry, 'id'>) => {
    setLogs(prev => [{ ...entry, id: nextId() }, ...prev].slice(0, 16));
  };

  const execute = useMutation({
    mutationFn: async (chain: string) => {
      const steps = chain
        .split('->')
        .map(part => part.trim().toLowerCase())
        .filter(Boolean);

      for (const step of steps) {
        if (step === 'triage' || step === 'resolve-next') {
          const action = await apiClient.resolveNextAction();
          if (action.route) {
            onRoute(action.route);
          }
          addLog({
            step,
            status: 'ok',
            detail: action.title,
          });
          continue;
        }

        if (step === 'close-weekly') {
          const run = await apiClient.runCloseRoutine('weekly');
          addLog({
            step,
            status: 'ok',
            detail: `Weekly close run ${run.id} (${run.exceptionCount} exceptions)`,
          });
          continue;
        }

        if (step === 'close-monthly') {
          const run = await apiClient.runCloseRoutine('monthly');
          addLog({
            step,
            status: 'ok',
            detail: `Monthly close run ${run.id} (${run.exceptionCount} exceptions)`,
          });
          continue;
        }

        if (step === 'playbook-create-default') {
          const playbook = await apiClient.createPlaybook('Ops Compression', [
            { verb: 'resolve-next-action', lane: 'triage' },
            { verb: 'run-close', period: 'weekly' },
          ]);
          addLog({
            step,
            status: 'ok',
            detail: `Created playbook ${playbook.name}`,
          });
          continue;
        }

        if (step === 'delegate-expiring') {
          const lane = await apiClient.assignDelegateLane(
            'Handle expiring contracts in 30d window',
            'delegate',
          );
          addLog({
            step,
            status: 'ok',
            detail: `Assigned lane ${lane.title}`,
          });
          continue;
        }

        if (step === 'open-review') {
          onRoute('/review?priority=urgent');
          addLog({
            step,
            status: 'ok',
            detail: 'Opened urgent review lane',
          });
          continue;
        }

        addLog({
          step,
          status: 'error',
          detail: 'Unknown step',
        });
      }

      onStatus('Command chain executed');
      await queryClient.invalidateQueries();
    },
  });

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Command Mesh</h2>
        <small>Chain commands using -&gt; separators</small>
      </header>

      <div className="fo-row">
        <input
          value={command}
          onChange={event => setCommand(event.target.value)}
          placeholder="triage -> close-weekly"
          className="fo-input"
        />
        <button
          className="fo-btn"
          type="button"
          disabled={execute.isPending}
          onClick={() => execute.mutate(command)}
        >
          {execute.isPending ? 'Running' : 'Execute'}
        </button>
      </div>

      <div className="fo-hints">
        <code>triage</code>
        <code>close-weekly</code>
        <code>close-monthly</code>
        <code>playbook-create-default</code>
        <code>delegate-expiring</code>
        <code>open-review</code>
      </div>

      <div className="fo-log-list">
        {logs.length === 0 ? <small>No command logs yet.</small> : null}
        {logs.map(log => (
          <article
            key={log.id}
            className={`fo-log ${log.status === 'error' ? 'fo-log-error' : ''}`}
          >
            <strong>{log.step}</strong>
            <span>{log.detail}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
