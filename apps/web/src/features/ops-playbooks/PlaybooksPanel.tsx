import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';

type PlaybooksPanelProps = {
  onStatus: (status: string) => void;
};

export function PlaybooksPanel({ onStatus }: PlaybooksPanelProps) {
  const queryClient = useQueryClient();
  const [playbookName, setPlaybookName] = useState('');

  const playbooks = useQuery({
    queryKey: ['playbooks'],
    queryFn: apiClient.listPlaybooks,
  });

  const create = useMutation({
    mutationFn: async (name: string) =>
      apiClient.createPlaybook(name, [
        { verb: 'resolve-next-action', lane: 'triage' },
        { verb: 'run-close', period: 'weekly' },
      ]),
    onSuccess: async created => {
      setPlaybookName('');
      onStatus(`Created playbook: ${created.name}`);
      await queryClient.invalidateQueries({ queryKey: ['playbooks'] });
    },
  });

  const run = useMutation({
    mutationFn: async (playbookId: string) => apiClient.runPlaybook(playbookId, true),
    onSuccess: result => {
      onStatus(`Playbook run ${result.id} complete (${result.executedSteps} steps).`);
    },
  });

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Ops Playbooks</h2>
        <small>Macro automation with dry-run control.</small>
      </header>

      <div className="fo-row">
        <input
          className="fo-input"
          value={playbookName}
          onChange={event => setPlaybookName(event.target.value)}
          placeholder="New playbook name"
        />
        <button
          className="fo-btn"
          disabled={!playbookName.trim() || create.isPending}
          onClick={() => create.mutate(playbookName.trim())}
        >
          Create
        </button>
      </div>

      <div className="fo-stack">
        {(playbooks.data || []).map(playbook => (
          <article key={playbook.id} className="fo-card">
            <div className="fo-space-between">
              <strong>{playbook.name}</strong>
              <small>{playbook.commands.length} steps</small>
            </div>
            <small>{playbook.description}</small>
            <button className="fo-btn-secondary" onClick={() => run.mutate(playbook.id)}>
              Dry-run
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
