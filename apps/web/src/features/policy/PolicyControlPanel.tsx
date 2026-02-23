import { useEffect, useMemo, useState } from 'react';
import { Trans } from 'react-i18next';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';
import type { EgressPolicy } from '../../core/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type PolicyControlPanelProps = {
  onStatus: (status: string) => void;
};

function parseProviders(input: string): string[] {
  return [
    ...new Set(
      input
        .split(',')
        .map(item => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function PolicyControlPanel({ onStatus }: PolicyControlPanelProps) {
  const queryClient = useQueryClient();
  const [allowCloud, setAllowCloud] = useState(false);
  const [providersInput, setProvidersInput] = useState('');
  const [redactionMode, setRedactionMode] =
    useState<EgressPolicy['redactionMode']>('strict');

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
        <h2>
          <Trans>Policy Plane</Trans>
        </h2>
        <small>
          Sovereignty-first model routing and auditable egress controls.
        </small>
      </header>

      <div className="fo-card">
        <label className="fo-row">
          <input
            type="checkbox"
            checked={allowCloud}
            onChange={event => setAllowCloud(event.target.checked)}
          />
          <span><Trans>Allow cloud model egress</Trans></span>
        </label>

        <label className="fo-stack">
          <small>Allowed providers (comma-separated)</small>
          <Input
            value={providersInput}
            onChange={event => setProvidersInput(event.target.value)}
            placeholder="openai, anthropic"
          />
        </label>

        <label className="fo-stack">
          <small><Trans>Redaction mode</Trans></small>
          <Select
            value={redactionMode}
            onValueChange={value =>
              setRedactionMode(value as EgressPolicy['redactionMode'])
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('Redaction Mode')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="strict">strict</SelectItem>
              <SelectItem value="balanced">balanced</SelectItem>
              <SelectItem value="off">off</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <Button
          disabled={savePolicy.isPending || policy.isLoading}
          onClick={() => savePolicy.mutate()}
        >
          {savePolicy.isPending ? 'Saving...' : t('Save policy')}
        </Button>
      </div>

      <div className="fo-stack">
        <strong><Trans>Egress audit timeline</Trans></strong>
        {audit.isLoading ? <small>Loading audit entries...</small> : null}
        {audit.isError ? (
          <small>Unable to load policy audit entries.</small>
        ) : null}
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
