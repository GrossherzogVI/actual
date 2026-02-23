import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';

const BRANCH_COLORS = ['var(--fo-info)', 'var(--fo-ok)', 'var(--fo-accent)', '#f97316'];

export function SpatialTwinPanel() {
  const queryClient = useQueryClient();
  const [branchName, setBranchName] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [amountDelta, setAmountDelta] = useState('150');
  const [riskDelta, setRiskDelta] = useState('-1');

  const branchesQuery = useQuery({
    queryKey: ['scenario-branches'],
    queryFn: apiClient.listScenarioBranches,
  });

  const branches = branchesQuery.data || [];
  const selectedBranch = branches.find(branch => branch.id === selectedBranchId) || null;
  const comparisonTarget =
    branches.find(branch => branch.id !== selectedBranchId) || null;

  useEffect(() => {
    if (!selectedBranchId && branches[0]) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, selectedBranchId]);

  const compareQuery = useQuery({
    queryKey: ['scenario-compare', selectedBranch?.id, comparisonTarget?.id],
    enabled: !!selectedBranch,
    queryFn: () =>
      apiClient.compareScenario(selectedBranch!.id, comparisonTarget?.id),
  });

  const createBranch = useMutation({
    mutationFn: async () => {
      const trimmed = branchName.trim();
      const label = trimmed || `Branch ${branches.length + 1}`;
      return apiClient.createScenarioBranch(label, selectedBranch?.id);
    },
    onSuccess: async created => {
      setBranchName('');
      setSelectedBranchId(created.id);
      await queryClient.invalidateQueries({ queryKey: ['scenario-branches'] });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBranch) return null;

      const numericAmount = Number(amountDelta);
      const numericRisk = Number(riskDelta);

      return apiClient.applyScenarioMutation(selectedBranch.id, 'manual-adjustment', {
        amountDelta: Number.isFinite(numericAmount) ? numericAmount : 0,
        riskDelta: Number.isFinite(numericRisk) ? numericRisk : 0,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['scenario-branches'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-compare'] }),
      ]);
    },
  });

  const adoptBranch = useMutation({
    mutationFn: async (branchId: string) => apiClient.adoptScenarioBranch(branchId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['scenario-branches'] });
    },
  });

  const positioned = useMemo(
    () =>
      branches.map((branch, index) => ({
        branch,
        top: index === 0 ? 116 : 20 + (index - 1) * 88,
        left: index === 0 ? 20 : 280,
        color: BRANCH_COLORS[index % BRANCH_COLORS.length],
      })),
    [branches],
  );

  return (
    <section className="fo-panel fo-twin-panel">
      <header className="fo-panel-header">
        <h2>Spatial Finance Twin</h2>
        <small>Branch, mutate, compare, adopt. No context switch required.</small>
      </header>

      <div className="fo-row">
        <input
          className="fo-input"
          value={branchName}
          onChange={event => setBranchName(event.target.value)}
          placeholder="Create scenario branch"
        />
        <button
          className="fo-btn"
          type="button"
          onClick={() => createBranch.mutate()}
          disabled={createBranch.isPending}
        >
          {createBranch.isPending ? 'Creating' : 'Branch'}
        </button>
      </div>

      <div className="fo-twin-canvas">
        <svg width="100%" height="100%" viewBox="0 0 560 300" preserveAspectRatio="xMidYMid meet">
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#4a6f99" />
            </marker>
          </defs>
          {positioned.slice(1).map((node, index) => (
            <line
              key={node.branch.id}
              x1={200}
              y1={145}
              x2={280}
              y2={index * 88 + 58}
              stroke="#4a6f99"
              strokeWidth="2"
              markerEnd="url(#arrow)"
            />
          ))}
        </svg>

        {positioned.map(node => (
          <article
            key={node.branch.id}
            className="fo-twin-node"
            style={{
              top: node.top,
              left: node.left,
              borderColor: node.color,
              boxShadow:
                selectedBranchId === node.branch.id
                  ? `0 0 0 1px ${node.color}`
                  : 'none',
            }}
          >
            <strong>{node.branch.name}</strong>
            <small>
              {node.branch.status} · {new Date(node.branch.updatedAtMs).toLocaleDateString()}
            </small>
            <div className="fo-row">
              <button
                className="fo-btn-secondary"
                type="button"
                onClick={() => setSelectedBranchId(node.branch.id)}
              >
                Select
              </button>
              <button
                className="fo-btn-secondary"
                type="button"
                onClick={() => adoptBranch.mutate(node.branch.id)}
                disabled={adoptBranch.isPending || node.branch.status === 'adopted'}
              >
                Adopt
              </button>
            </div>
          </article>
        ))}

        {positioned.length === 0 ? (
          <article className="fo-twin-node" style={{ top: 110, left: 160 }}>
            <strong>No branches yet</strong>
            <small>Create a scenario branch to start simulation.</small>
          </article>
        ) : null}
      </div>

      <div className="fo-row">
        <input
          className="fo-input"
          value={amountDelta}
          onChange={event => setAmountDelta(event.target.value)}
          placeholder="Amount delta"
        />
        <input
          className="fo-input"
          value={riskDelta}
          onChange={event => setRiskDelta(event.target.value)}
          placeholder="Risk delta"
        />
        <button
          className="fo-btn"
          type="button"
          disabled={!selectedBranch || applyMutation.isPending}
          onClick={() => applyMutation.mutate()}
        >
          {applyMutation.isPending ? 'Applying' : 'Apply Mutation'}
        </button>
      </div>

      <article className="fo-card">
        <strong>Branch Comparison</strong>
        <small>
          {selectedBranch?.name || 'No selected branch'} vs {comparisonTarget?.name || 'baseline'}
        </small>
        <small>
          Amount delta: {compareQuery.data?.diff.amountDelta ?? 0} · Risk delta:{' '}
          {compareQuery.data?.diff.riskDelta ?? 0}
        </small>
      </article>
    </section>
  );
}
