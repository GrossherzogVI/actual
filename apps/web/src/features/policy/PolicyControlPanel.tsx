import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { EgressPolicy } from '../../core/types';
import { apiClient } from '../../core/api/client';

type PolicyControlPanelProps = {
  onStatus: (status: string) => void;
};

function parseProviders(input: string): string[] {
  return [...new Set(input.split(',').map(item => item.trim()).filter(Boolean))];
}

export function PolicyControlPanel({ onStatus }: PolicyControlPanelProps) {
  const queryClient = useQueryClient();
  const [allowCloud, setAllowCloud] = useState(false);
  const [providersInput, setProvidersInput] = useState('');
  const [redactionMode, setRedactionMode] = useState<EgressPolicy['redactionMode']>(
    'strict',
  );

  const policy = useQuery({
    queryKey: ['egress-policy'],
    queryFn: apiClient.getEgressPolicy,
  });

  const audit = useQuery({
    queryKey: ['egress-audit'],
    queryFn: () => apiClient.listEgressAudit(25),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!policy.data) return;
    setAllowCloud(policy.data.allowCloud);
    setProvidersInput(policy.data.allowedProviders.join(', '));
    setRedactionMode(policy.data.redactionMode);
  }, [policy.data]);

  const currentPolicy = useMemo(
    () => ({
      allowCloud,
      allowedProviders: parseProviders(providersInput),
      redactionMode,
    }),
    [allowCloud, providersInput, redactionMode],
  );

  const savePolicy = useMutation({
    mutationFn: () => apiClient.setEgressPolicy(currentPolicy),
    onSuccess: async updated => {
      onStatus(
        `Policy updated: cloud ${updated.allowCloud ? 'enabled' : 'disabled'} / redaction ${updated.redactionMode}`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['egress-policy'] }),
        queryClient.invalidateQueries({ queryKey: ['egress-audit'] }),
      ]);
    },
  });

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Policy Plane</h2>
        <small>Sovereignty-first model routing and auditable egress controls.</small>
      </header>

      <div className="fo-card">
        <label className="fo-row">
          <input
            type="checkbox"
            checked={allowCloud}
            onChange={event => setAllowCloud(event.target.checked)}
          />
          <span>Allow cloud model egress</span>
        </label>

        <label className="fo-stack">
          <small>Allowed providers (comma-separated)</small>
          <input
            className="fo-input"
            value={providersInput}
            onChange={event => setProvidersInput(event.target.value)}
            placeholder="openai, anthropic"
          />
        </label>

        <label className="fo-stack">
          <small>Redaction mode</small>
          <select
            className="fo-input"
            value={redactionMode}
            onChange={event =>
              setRedactionMode(event.target.value as EgressPolicy['redactionMode'])
            }
          >
            <option value="strict">strict</option>
            <option value="balanced">balanced</option>
            <option value="off">off</option>
          </select>
        </label>

        <button
          className="fo-btn"
          type="button"
          disabled={savePolicy.isPending || policy.isLoading}
          onClick={() => savePolicy.mutate()}
        >
          Save policy
        </button>
      </div>

      <div className="fo-stack">
        <strong>Egress audit timeline</strong>
        {audit.isLoading ? <small>Loading audit entries...</small> : null}
        {audit.isError ? <small>Unable to load policy audit entries.</small> : null}
        <div className="fo-log-list">
          {(audit.data || []).map(entry => (
            <article className="fo-log" key={entry.id}>
              <div className="fo-space-between">
                <strong>{entry.eventType}</strong>
                <small>{new Date(entry.createdAtMs).toLocaleString()}</small>
              </div>
              <small>{entry.provider || 'local-policy'}</small>
              <small>{JSON.stringify(entry.payload || {}, null, 0)}</small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

