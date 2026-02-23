import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AppRecommendation,
  ExecutionMode,
  GuardrailProfile,
} from '../../core/types';
import { apiClient } from '../../core/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type DecisionGraphPanelProps = {
  recommendations: AppRecommendation[];
  onStatus: (status: string) => void;
  onRoute: (route: string) => void;
};

type RecommendationBlueprint = {
  route: string;
  chain: string;
  playbookName: string;
  playbookCommands: Array<Record<string, unknown>>;
  triggerLabel: string;
  consequenceLabel: string;
  decisionLabel: string;
  impactLabel: string;
};

function short(text: string, max = 28) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function compactClause(text: string, fallback: string, max = 26) {
  const [firstClause] = text.split('.');
  const candidate = firstClause?.trim() || fallback;
  return short(candidate, max);
}

function recommendationBlueprint(
  recommendation: AppRecommendation,
): RecommendationBlueprint {
  if (recommendation.id === 'rec-review-urgent') {
    return {
      route: '/review?priority=urgent',
      chain: 'triage -> open-review',
      playbookName: 'Recommendation: urgent review stabilizer',
      playbookCommands: [
        { verb: 'resolve-next-action', lane: 'triage' },
        { verb: 'open-urgent-review' },
        { verb: 'refresh-command-center' },
      ],
      triggerLabel: 'urgent queue pressure',
      consequenceLabel: 'risk of misclassified cashflow',
      decisionLabel: 'prioritize urgent review now',
      impactLabel: 'risk-reduction',
    };
  }

  if (recommendation.id === 'rec-contract-expiring') {
    return {
      route: '/contracts?filter=expiring',
      chain: 'triage -> expiring<30d -> batch-renegotiate',
      playbookName: 'Recommendation: expiring contracts sweep',
      playbookCommands: [
        { verb: 'resolve-next-action', lane: 'triage' },
        { verb: 'open-expiring-contracts', windowDays: 30 },
        { verb: 'assign-expiring-contracts-lane' },
      ],
      triggerLabel: 'expiring contract window',
      consequenceLabel: 'avoidable recurring spend',
      decisionLabel: 'renegotiate before deadline',
      impactLabel: 'cost-avoidance',
    };
  }

  if (recommendation.id === 'rec-close-loop') {
    return {
      route: '/ops#close-loop',
      chain: 'triage -> close-weekly -> refresh',
      playbookName: 'Recommendation: weekly close compression',
      playbookCommands: [
        { verb: 'resolve-next-action', lane: 'triage' },
        { verb: 'run-close', period: 'weekly' },
        { verb: 'refresh-command-center' },
      ],
      triggerLabel: 'pending operations accumulation',
      consequenceLabel: 'manual throughput drag',
      decisionLabel: 'run close automation loop',
      impactLabel: 'operational-compression',
    };
  }

  const route = recommendation.expectedImpact.includes('risk')
    ? '/review?priority=urgent'
    : recommendation.expectedImpact.includes('cost')
      ? '/contracts?filter=expiring'
      : '/ops';
  return {
    route,
    chain: 'triage -> refresh',
    playbookName: `Recommendation: ${recommendation.title}`,
    playbookCommands: [
      { verb: 'resolve-next-action', lane: 'triage' },
      { verb: 'refresh-command-center' },
    ],
    triggerLabel: compactClause(recommendation.rationale, 'signal pressure'),
    consequenceLabel: short(recommendation.expectedImpact, 26),
    decisionLabel: short(recommendation.title.toLowerCase(), 26),
    impactLabel: short(recommendation.expectedImpact, 22),
  };
}

function asError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback}: ${error.message}`;
  }
  return fallback;
}

export function DecisionGraphPanel({
  recommendations,
  onStatus,
  onRoute,
}: DecisionGraphPanelProps) {
  const queryClient = useQueryClient();
  const [selectedRecommendationId, setSelectedRecommendationId] = useState('');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('dry-run');
  const [guardrailProfile, setGuardrailProfile] =
    useState<GuardrailProfile>('balanced');
  const [rollbackWindowMinutes, setRollbackWindowMinutes] = useState(60);

  useEffect(() => {
    if (!selectedRecommendationId && recommendations[0]) {
      setSelectedRecommendationId(recommendations[0].id);
      return;
    }
    if (
      selectedRecommendationId &&
      !recommendations.some(recommendation => recommendation.id === selectedRecommendationId)
    ) {
      setSelectedRecommendationId(recommendations[0]?.id || '');
    }
  }, [recommendations, selectedRecommendationId]);

  const selected = useMemo(
    () =>
      recommendations.find(
        recommendation => recommendation.id === selectedRecommendationId,
      ) || recommendations[0],
    [recommendations, selectedRecommendationId],
  );

  const blueprint = useMemo(
    () => (selected ? recommendationBlueprint(selected) : null),
    [selected],
  );

  const explanation = useQuery({
    queryKey: ['recommendation-explain', selected?.id],
    queryFn: () => apiClient.explainRecommendation(selected as AppRecommendation),
    enabled: !!selected,
  });

  const executeRecommendation = useMutation({
    mutationFn: async () => {
      if (!selected || !blueprint) {
        throw new Error('No selected recommendation');
      }
      return apiClient.executeCommandChain(blueprint.chain, 'delegate', {
        executionMode,
        guardrailProfile,
        rollbackWindowMinutes,
        rollbackOnFailure: executionMode === 'live',
      });
    },
    onSuccess: async run => {
      if (!selected || !blueprint) {
        return;
      }

      const nextRoute =
        run.steps.find(step => typeof step.route === 'string')?.route || blueprint.route;
      onRoute(nextRoute);
      onStatus(
        `Decision executed: ${selected.title} -> ${run.status} (${run.errorCount} errors).`,
      );

      void apiClient
        .recordActionOutcome(
          selected.id,
          'executed',
          `Decision graph execution (${run.executionMode}) run=${run.id}`,
        )
        .catch(() => { });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['command-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['money-pulse'] }),
        queryClient.invalidateQueries({ queryKey: ['focus-panel'] }),
      ]);
    },
    onError: error => {
      onStatus(asError(error, 'Decision execution failed'));
    },
  });

  const createPlaybook = useMutation({
    mutationFn: async () => {
      if (!selected || !blueprint) {
        throw new Error('No selected recommendation');
      }
      return apiClient.createPlaybook(
        blueprint.playbookName,
        blueprint.playbookCommands,
      );
    },
    onSuccess: async playbook => {
      onStatus(`Playbook created from decision graph: ${playbook.name}`);
      await queryClient.invalidateQueries({ queryKey: ['playbooks'] });
    },
    onError: error => {
      onStatus(asError(error, 'Create playbook failed'));
    },
  });

  const captureOutcome = useMutation({
    mutationFn: async (input: { outcome: string; notes?: string }) => {
      if (!selected) {
        throw new Error('No selected recommendation');
      }
      return apiClient.recordActionOutcome(selected.id, input.outcome, input.notes);
    },
    onSuccess: async (_result, input) => {
      if (!selected) return;
      onStatus(`Recorded outcome for ${selected.title}: ${input.outcome}`);
      await queryClient.invalidateQueries({ queryKey: ['focus-panel'] });
    },
    onError: error => {
      onStatus(asError(error, 'Record outcome failed'));
    },
  });

  if (!selected || !blueprint) {
    return (
      <section className="fo-panel">
        <header className="fo-panel-header">
          <h2>Decision Graph</h2>
          <small>Causal explainability, confidence, and reversible outcomes.</small>
        </header>
        <small>No recommendations available yet.</small>
      </section>
    );
  }

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Decision Graph</h2>
        <small>
          Explainable intelligence with direct execution, simulation, and outcome capture.
        </small>
      </header>

      <div className="fo-row">
        <Select
          value={selected.id}
          onValueChange={value => setSelectedRecommendationId(value)}
        >
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Recommendation" />
          </SelectTrigger>
          <SelectContent>
            {(recommendations || []).map(recommendation => (
              <SelectItem key={recommendation.id} value={recommendation.id}>
                {recommendation.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={executionMode}
          onValueChange={value => setExecutionMode(value as ExecutionMode)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dry-run">dry-run</SelectItem>
            <SelectItem value="live">live</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={guardrailProfile}
          onValueChange={value => setGuardrailProfile(value as GuardrailProfile)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Guardrail" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="strict">strict</SelectItem>
            <SelectItem value="balanced">balanced</SelectItem>
            <SelectItem value="off">off</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="fo-row">
        <Input
          className="w-[120px]"
          aria-label="decision rollback window minutes"
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
          variant="secondary"
          onClick={() => onRoute(blueprint.route)}
        >
          Open impacted surface
        </Button>
        <Button
          variant="secondary"
          onClick={() => onRoute('/ops#spatial-twin')}
        >
          Simulate in spatial twin
        </Button>
      </div>

      <div className="fo-decision-graph">
        <svg width="100%" height="280" viewBox="0 0 620 280" preserveAspectRatio="xMidYMid meet">
          <defs>
            <marker
              id="decision-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="#4a6f99" />
            </marker>
          </defs>

          <line
            x1="80"
            y1="140"
            x2="210"
            y2="70"
            stroke="#4a6f99"
            strokeWidth="2"
            markerEnd="url(#decision-arrow)"
          />
          <line
            x1="80"
            y1="140"
            x2="210"
            y2="210"
            stroke="#4a6f99"
            strokeWidth="2"
            markerEnd="url(#decision-arrow)"
          />
          <line
            x1="350"
            y1="70"
            x2="500"
            y2="140"
            stroke="#4a6f99"
            strokeWidth="2"
            markerEnd="url(#decision-arrow)"
          />
          <line
            x1="350"
            y1="210"
            x2="500"
            y2="140"
            stroke="#4a6f99"
            strokeWidth="2"
            markerEnd="url(#decision-arrow)"
          />

          <g className="fo-graph-node" transform="translate(20 115)">
            <rect width="120" height="50" rx="10" />
            <text x="60" y="30" textAnchor="middle">
              {short(selected.title, 18)}
            </text>
          </g>

          <g className="fo-graph-node fo-graph-node-info" transform="translate(210 45)">
            <rect width="145" height="50" rx="10" />
            <text x="72" y="30" textAnchor="middle">
              {short(blueprint.triggerLabel, 21)}
            </text>
          </g>

          <g className="fo-graph-node fo-graph-node-warn" transform="translate(210 185)">
            <rect width="145" height="50" rx="10" />
            <text x="72" y="30" textAnchor="middle">
              {short(blueprint.consequenceLabel, 21)}
            </text>
          </g>

          <g className="fo-graph-node fo-graph-node-ok" transform="translate(500 115)">
            <rect width="105" height="50" rx="10" />
            <text x="52" y="30" textAnchor="middle">
              {Math.round(selected.confidence * 100)}% conf
            </text>
          </g>
        </svg>
      </div>

      <div className="fo-playbook-chain-grid">
        <article className="fo-playbook-chain-block">
          <small className="fo-muted-line">trigger</small>
          <strong>{blueprint.triggerLabel}</strong>
        </article>
        <article className="fo-playbook-chain-block">
          <small className="fo-muted-line">consequence</small>
          <strong>{blueprint.consequenceLabel}</strong>
        </article>
        <article className="fo-playbook-chain-block">
          <small className="fo-muted-line">decision</small>
          <strong>{blueprint.decisionLabel}</strong>
        </article>
        <article className="fo-playbook-chain-block">
          <small className="fo-muted-line">impact</small>
          <strong>{blueprint.impactLabel}</strong>
        </article>
      </div>

      <article className="fo-card">
        <div className="fo-space-between">
          <strong>{selected.title}</strong>
          <small>
            provenance: {selected.provenance} | reversible:{' '}
            {selected.reversible ? 'yes' : 'no'}
          </small>
        </div>
        <small>{selected.rationale}</small>
        <small>
          {explanation.isLoading
            ? 'Loading explanation...'
            : explanation.data?.explanation || 'No explanation available.'}
        </small>
        <small>
          recommended chain: <code>{blueprint.chain}</code>
        </small>
      </article>

      <div className="fo-row">
        <Button
          disabled={executeRecommendation.isPending}
          onClick={() => executeRecommendation.mutate()}
        >
          {executeRecommendation.isPending
            ? 'Executing...'
            : executionMode === 'live'
              ? 'Execute live recommendation'
              : 'Dry-run recommendation'}
        </Button>
        <Button
          variant="secondary"
          disabled={createPlaybook.isPending}
          onClick={() => createPlaybook.mutate()}
        >
          {createPlaybook.isPending ? 'Creating...' : 'Generate playbook'}
        </Button>
        <Button
          variant="secondary"
          disabled={captureOutcome.isPending}
          onClick={() =>
            captureOutcome.mutate({
              outcome: 'accepted',
              notes: 'Accepted from decision graph',
            })
          }
        >
          Mark accepted
        </Button>
        <Button
          variant="secondary"
          disabled={captureOutcome.isPending}
          onClick={() =>
            captureOutcome.mutate({
              outcome: 'deferred',
              notes: 'Deferred from decision graph',
            })
          }
        >
          Mark deferred
        </Button>
      </div>
    </section>
  );
}
