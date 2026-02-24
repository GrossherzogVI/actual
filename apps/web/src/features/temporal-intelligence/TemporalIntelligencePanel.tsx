import { useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';
import type {
  ExecutionMode,
  GuardrailProfile,
  TemporalLaneSignal,
  TemporalRecommendedChain,
  TemporalSignalSeverity,
} from '../../core/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type TemporalIntelligencePanelProps = {
  onStatus: (status: string) => void;
  onRoute: (route: string) => void;
};

const BUNDESLAND_OPTIONS = [
  'BW',
  'BY',
  'BE',
  'BB',
  'HB',
  'HH',
  'HE',
  'MV',
  'NI',
  'NW',
  'RP',
  'SL',
  'SN',
  'ST',
  'SH',
  'TH',
] as const;

function laneSeverityClass(severity: TemporalSignalSeverity) {
  if (severity === 'critical') return 'fo-temporal-lane-critical';
  if (severity === 'warn') return 'fo-temporal-lane-warn';
  return 'fo-temporal-lane-info';
}

function calendarDayClass(input: {
  isBusinessDay: boolean;
  isHoliday: boolean;
}) {
  if (input.isHoliday) return 'fo-temporal-day fo-temporal-day-holiday';
  if (input.isBusinessDay) return 'fo-temporal-day fo-temporal-day-business';
  return 'fo-temporal-day fo-temporal-day-weekend';
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${fallback}: ${error.message}`;
  }
  return fallback;
}

function dueLabel(signal: TemporalLaneSignal): string {
  if (typeof signal.daysUntilDue !== 'number') {
    return signal.deadlineDate || 'no due date';
  }
  if (signal.daysUntilDue < 0) {
    return `overdue ${Math.abs(signal.daysUntilDue)}d`;
  }
  if (signal.daysUntilDue === 0) {
    return 'due today';
  }
  if (signal.daysUntilDue === 1) {
    return 'due tomorrow';
  }
  return `due in ${signal.daysUntilDue}d`;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TemporalIntelligencePanel({
  onStatus,
  onRoute,
}: TemporalIntelligencePanelProps) {
  const queryClient = useQueryClient();
  const [bundesland, setBundesland] =
    useState<(typeof BUNDESLAND_OPTIONS)[number]>('BE');
  const [horizonDays, setHorizonDays] = useState(14);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('dry-run');
  const [guardrailProfile, setGuardrailProfile] =
    useState<GuardrailProfile>('strict');
  const [rollbackWindowMinutes, setRollbackWindowMinutes] = useState(120);
  const [selectedChainId, setSelectedChainId] = useState('');

  const temporalSignals = useQuery({
    queryKey: ['temporal-signals', bundesland, horizonDays],
    queryFn: () =>
      apiClient.getTemporalSignals({
        bundesland,
        horizonDays,
      }),
    refetchInterval: 30_000,
  });

  const recommendedChains = temporalSignals.data?.recommendedChains || [];

  useEffect(() => {
    if (!selectedChainId && recommendedChains[0]) {
      setSelectedChainId(recommendedChains[0].id);
      return;
    }
    if (
      selectedChainId &&
      !recommendedChains.some(chain => chain.id === selectedChainId)
    ) {
      setSelectedChainId(recommendedChains[0]?.id || '');
    }
  }, [recommendedChains, selectedChainId]);

  const selectedChain = useMemo<TemporalRecommendedChain | null>(
    () =>
      recommendedChains.find(chain => chain.id === selectedChainId) ||
      recommendedChains[0] ||
      null,
    [recommendedChains, selectedChainId],
  );

  const executeChain = useMutation({
    mutationFn: async (chain: string) =>
      apiClient.executeCommandChain(chain, 'delegate', {
        executionMode,
        guardrailProfile,
        rollbackWindowMinutes,
        rollbackOnFailure: executionMode === 'live',
      }),
    onSuccess: async run => {
      const route = run.steps.find(
        step => typeof step.route === 'string',
      )?.route;
      onRoute(route || '/ops#command-mesh');
      onStatus(
        `Temporal chain ${run.status}: ${run.steps.length} steps / ${run.errorCount} errors.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['command-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['money-pulse'] }),
        queryClient.invalidateQueries({ queryKey: ['temporal-signals'] }),
      ]);
    },
    onError: error => {
      onStatus(errorMessage(error, 'Temporal chain execution failed'));
    },
  });

  const simulateChain = useMutation({
    mutationFn: async (chain: TemporalRecommendedChain) =>
      apiClient.simulateScenarioBranch({
        label: `${chain.label} ${todayKey()}`,
        chain: chain.chain,
        source: 'temporal-intelligence',
        expectedImpact: chain.reason,
        confidence: 0.85,
        amountDelta: chain.amountDelta,
        riskDelta: chain.riskDelta,
        notes: `Generated from temporal intelligence. Chain: ${chain.chain}`,
      }),
    onSuccess: async simulation => {
      onRoute('/ops#spatial-twin');
      onStatus(`Temporal simulation branch ready: ${simulation.branch.name}`);
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
      onStatus(errorMessage(error, 'Temporal simulation failed'));
    },
  });

  return (
    <section className="fo-panel" id="temporal-intelligence">
      <header className="fo-panel-header">
        <h2>
          Temporal Intelligence
        </h2>
        <small>
          Business-day aware deadline pressure with direct command mesh
          execution.
        </small>
      </header>

      <div className="fo-row">
        <Select
          value={bundesland}
          onValueChange={value =>
            setBundesland(value as (typeof BUNDESLAND_OPTIONS)[number])
          }
        >
          <SelectTrigger aria-label="temporal bundesland">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUNDESLAND_OPTIONS.map(code => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label="temporal horizon days"
          type="number"
          min={7}
          max={45}
          value={horizonDays}
          onChange={event =>
            setHorizonDays(
              Math.max(7, Math.min(45, Number(event.target.value) || 14)),
            )
          }
        />
        <Select
          value={executionMode}
          onValueChange={value => setExecutionMode(value as ExecutionMode)}
        >
          <SelectTrigger aria-label="temporal execution mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dry-run">dry-run</SelectItem>
            <SelectItem value="live">live</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="fo-row">
        <Select
          value={guardrailProfile}
          onValueChange={value =>
            setGuardrailProfile(value as GuardrailProfile)
          }
        >
          <SelectTrigger aria-label="temporal guardrail profile">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="strict">strict</SelectItem>
            <SelectItem value="balanced">balanced</SelectItem>
            <SelectItem value="off">off</SelectItem>
          </SelectContent>
        </Select>
        <Input
          aria-label="temporal rollback window"
          type="number"
          min={1}
          max={1440}
          value={rollbackWindowMinutes}
          onChange={event =>
            setRollbackWindowMinutes(
              Math.max(1, Math.min(1440, Number(event.target.value) || 120)),
            )
          }
        />
        <Button
          variant="secondary"
          onClick={() => onRoute('/ops#delegate-lanes')}
        >
          Open lanes
        </Button>
      </div>

      {temporalSignals.isLoading ? (
        <small>Loading temporal signals...</small>
      ) : null}
      {temporalSignals.isError ? (
        <small>Temporal intelligence unavailable.</small>
      ) : null}

      {temporalSignals.data ? (
        <>
          <div className="fo-temporal-summary">
            <article className="fo-temporal-stat">
              <small>critical</small>
              <strong>{temporalSignals.data.summary.critical}</strong>
            </article>
            <article className="fo-temporal-stat">
              <small>warn</small>
              <strong>{temporalSignals.data.summary.warn}</strong>
            </article>
            <article className="fo-temporal-stat">
              <small>business days</small>
              <strong>{temporalSignals.data.summary.businessDays}</strong>
            </article>
            <article className="fo-temporal-stat">
              <small>next holiday</small>
              <strong>{temporalSignals.data.nextHolidayDate || '-'}</strong>
            </article>
          </div>

          <div
            className="fo-temporal-calendar"
            aria-label="temporal calendar strip"
          >
            {temporalSignals.data.calendar.map(day => (
              <article className={calendarDayClass(day)} key={day.date}>
                <small>{day.weekday}</small>
                <strong>{day.date.slice(5)}</strong>
              </article>
            ))}
          </div>

          <div className="fo-stack">
            <small className="fo-muted-line">Recommended chains</small>
            <Select
              value={selectedChain?.id || ''}
              onValueChange={value => setSelectedChainId(value)}
            >
              <SelectTrigger aria-label="temporal recommended chain">
                <SelectValue placeholder="Select chain" />
              </SelectTrigger>
              <SelectContent>
                {recommendedChains.map(chain => (
                  <SelectItem key={chain.id} value={chain.id}>
                    {chain.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedChain ? (
              <article className="fo-card">
                <strong>{selectedChain.label}</strong>
                <small>{selectedChain.reason}</small>
                <small>
                  projected: amount +{selectedChain.amountDelta} / risk{' '}
                  {selectedChain.riskDelta}
                </small>
                <code>{selectedChain.chain}</code>
              </article>
            ) : (
              <small>No temporal recommendation chain available.</small>
            )}
            <div className="fo-row">
              <Button
                disabled={!selectedChain || executeChain.isPending}
                onClick={() => {
                  if (!selectedChain) return;
                  executeChain.mutate(selectedChain.chain);
                }}
              >
                {executeChain.isPending
                  ? 'Executing...'
                  : executionMode === 'live'
                    ? 'Execute live temporal chain'
                    : 'Dry-run temporal chain'}
              </Button>
              <Button
                variant="secondary"
                disabled={!selectedChain || simulateChain.isPending}
                onClick={() => {
                  if (!selectedChain) return;
                  simulateChain.mutate(selectedChain);
                }}
              >
                {simulateChain.isPending
                  ? 'Simulating...'
                  : 'Simulate chain in spatial twin'}
              </Button>
            </div>
          </div>

          <div className="fo-temporal-lanes">
            {(temporalSignals.data.laneSignals || [])
              .slice(0, 8)
              .map(signal => (
                <article
                  key={signal.laneId}
                  className={`fo-temporal-lane ${laneSeverityClass(signal.severity)}`}
                >
                  <div className="fo-space-between">
                    <strong>{signal.title}</strong>
                    <small>{dueLabel(signal)}</small>
                  </div>
                  <small>
                    {signal.assignee} · {signal.priority} · {signal.status}
                  </small>
                  <small>{signal.reason}</small>
                  <code>{signal.recommendedChain}</code>
                  <div className="fo-row">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onRoute('/ops#delegate-lanes')}
                    >
                      Open lane board
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={executeChain.isPending}
                      onClick={() =>
                        executeChain.mutate(signal.recommendedChain)
                      }
                    >
                      Run lane chain
                    </Button>
                  </div>
                </article>
              ))}

            {temporalSignals.data.laneSignals.length === 0 ? (
              <small>No active delegate lanes with temporal pressure.</small>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
