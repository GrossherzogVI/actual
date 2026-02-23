import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppRecommendation } from '../../core/types';
import { apiClient } from '../../core/api/client';

type DecisionGraphPanelProps = {
  recommendations: AppRecommendation[];
  onStatus: (status: string) => void;
};

function short(text: string, max = 24) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function causeFromRationale(rationale: string, fallback: string): string {
  const [firstClause] = rationale.split('.');
  const compact = firstClause?.trim();
  if (!compact) return fallback;
  return short(compact, 22);
}

export function DecisionGraphPanel({
  recommendations,
  onStatus,
}: DecisionGraphPanelProps) {
  const queryClient = useQueryClient();
  const [selectedRecommendationId, setSelectedRecommendationId] = useState('');

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

  const explanation = useQuery({
    queryKey: ['recommendation-explain', selected?.id],
    queryFn: () => apiClient.explainRecommendation(selected as AppRecommendation),
    enabled: !!selected,
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
  });

  const causeA = selected
    ? causeFromRationale(selected.rationale, 'Temporal pressure')
    : 'Temporal pressure';
  const causeB = selected ? short(selected.provenance, 22) : 'Signal engine';
  const action = selected
    ? `${Math.round(selected.confidence * 100)}% conf`
    : 'Action';
  const impact = selected ? short(selected.expectedImpact, 22) : 'Impact';

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Decision Graph</h2>
        <small>Causal explainability, confidence, and reversible outcomes.</small>
      </header>

      <div className="fo-row">
        <select
          className="fo-input"
          value={selected?.id || ''}
          onChange={event => setSelectedRecommendationId(event.target.value)}
        >
          {(recommendations || []).map(recommendation => (
            <option key={recommendation.id} value={recommendation.id}>
              {recommendation.title}
            </option>
          ))}
        </select>
      </div>

      <div className="fo-decision-graph">
        <svg width="100%" height="290" viewBox="0 0 620 290" preserveAspectRatio="xMidYMid meet">
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
            x1="130"
            y1="140"
            x2="280"
            y2="70"
            stroke="#4a6f99"
            strokeWidth="2"
            markerEnd="url(#decision-arrow)"
          />
          <line
            x1="130"
            y1="140"
            x2="280"
            y2="210"
            stroke="#4a6f99"
            strokeWidth="2"
            markerEnd="url(#decision-arrow)"
          />
          <line
            x1="360"
            y1="70"
            x2="520"
            y2="140"
            stroke="#4a6f99"
            strokeWidth="2"
            markerEnd="url(#decision-arrow)"
          />
          <line
            x1="360"
            y1="210"
            x2="520"
            y2="140"
            stroke="#4a6f99"
            strokeWidth="2"
            markerEnd="url(#decision-arrow)"
          />

          <g className="fo-graph-node" transform="translate(70 115)">
            <rect width="120" height="50" rx="10" />
            <text x="60" y="30" textAnchor="middle">
              {selected ? short(selected.title, 18) : 'No signal'}
            </text>
          </g>

          <g className="fo-graph-node fo-graph-node-info" transform="translate(280 45)">
            <rect width="140" height="50" rx="10" />
            <text x="70" y="30" textAnchor="middle">
              {causeA}
            </text>
          </g>

          <g className="fo-graph-node fo-graph-node-warn" transform="translate(280 185)">
            <rect width="140" height="50" rx="10" />
            <text x="70" y="30" textAnchor="middle">
              {causeB}
            </text>
          </g>

          <g className="fo-graph-node fo-graph-node-ok" transform="translate(520 115)">
            <rect width="95" height="50" rx="10" />
            <text x="47" y="30" textAnchor="middle">
              {action}
            </text>
          </g>
        </svg>
      </div>

      {selected ? (
        <article className="fo-card">
          <div className="fo-space-between">
            <strong>{selected.title}</strong>
            <small>{impact}</small>
          </div>
          <small>{selected.rationale}</small>
          <small>reversible: {selected.reversible ? 'yes' : 'no'}</small>
          <small>
            {explanation.isLoading
              ? 'Loading explanation...'
              : explanation.data?.explanation || 'No explanation available.'}
          </small>
          <div className="fo-row">
            <button
              className="fo-btn-secondary"
              type="button"
              disabled={captureOutcome.isPending}
              onClick={() =>
                captureOutcome.mutate({
                  outcome: 'accepted',
                  notes: 'Executed from decision graph',
                })
              }
            >
              Mark accepted
            </button>
            <button
              className="fo-btn-secondary"
              type="button"
              disabled={captureOutcome.isPending}
              onClick={() =>
                captureOutcome.mutate({
                  outcome: 'deferred',
                  notes: 'Deferred from decision graph',
                })
              }
            >
              Mark deferred
            </button>
          </div>
        </article>
      ) : (
        <small>No recommendations available yet.</small>
      )}
    </section>
  );
}

