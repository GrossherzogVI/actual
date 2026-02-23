import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { COMMAND_MESH_HINTS } from '@finance-os/domain-kernel';

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
      const run = await apiClient.executeCommandChain(chain);

      for (const step of run.steps) {
        addLog({
          step: step.raw,
          status: step.status,
          detail: step.detail,
        });

        if (step.route) {
          onRoute(step.route);
        }
      }

      onStatus(
        run.errorCount > 0
          ? `Command chain executed with ${run.errorCount} error(s)`
          : 'Command chain executed',
      );
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
        {COMMAND_MESH_HINTS.map(hint => (
          <code key={hint.command}>{hint.command}</code>
        ))}
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
