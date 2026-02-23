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
  const [forceAdopt, setForceAdopt] = useState(false);

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

  const mutationsQuery = useQuery({
    queryKey: ['scenario-mutations', selectedBranch?.id],
    enabled: !!selectedBranch,
    queryFn: () => apiClient.listScenarioMutations(selectedBranch!.id),
  });

  const adoptionCheckQuery = useQuery({
    queryKey: ['scenario-adoption-check', selectedBranch?.id, comparisonTarget?.id],
    enabled: !!selectedBranch,
    queryFn: () =>
      apiClient.getScenarioAdoptionCheck(selectedBranch!.id, comparisonTarget?.id),
  });

  const lineageQuery = useQuery({
    queryKey: ['scenario-lineage', selectedBranch?.id],
    enabled: !!selectedBranch,
    queryFn: () => apiClient.getScenarioLineage(selectedBranch!.id),
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['scenario-branches'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-adoption-check'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-lineage'] }),
      ]);
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
        queryClient.invalidateQueries({ queryKey: ['scenario-mutations'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-adoption-check'] }),
      ]);
    },
  });

  const adoptBranch = useMutation({
    mutationFn: async (input: { branchId: string; force?: boolean }) =>
      apiClient.adoptScenarioBranch(input.branchId, {
        force: input.force,
        againstBranchId:
          selectedBranch?.id === input.branchId ? comparisonTarget?.id : undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['scenario-branches'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-adoption-check'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-lineage'] }),
      ]);
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
                onClick={() =>
                  adoptBranch.mutate({
                    branchId: node.branch.id,
                    force: forceAdopt && selectedBranchId === node.branch.id,
                  })
                }
                disabled={
                  adoptBranch.isPending ||
                  node.branch.status === 'adopted' ||
                  (selectedBranchId === node.branch.id &&
                    !forceAdopt &&
                    adoptionCheckQuery.data !== null &&
                    !!adoptionCheckQuery.data &&
                    !adoptionCheckQuery.data.canAdopt)
                }
              >
                {selectedBranchId === node.branch.id && forceAdopt ? 'Force Adopt' : 'Adopt'}
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

      <article className="fo-card">
        <strong>Adoption Guardrail</strong>
        <small>{adoptionCheckQuery.data?.summary || 'Select a branch to evaluate adoption risk.'}</small>
        <small>
          risk score: {adoptionCheckQuery.data?.riskScore ?? '-'} · mutations:{' '}
          {adoptionCheckQuery.data?.mutationCount ?? 0} · lineage depth:{' '}
          {adoptionCheckQuery.data?.lineageDepth ?? 0}
        </small>
        {(adoptionCheckQuery.data?.blockers || []).map(blocker => (
          <small key={blocker}>Blocker: {blocker}</small>
        ))}
        {(adoptionCheckQuery.data?.warnings || []).map(warning => (
          <small key={warning}>Warning: {warning}</small>
        ))}
        <label className="fo-row">
          <input
            type="checkbox"
            checked={forceAdopt}
            onChange={event => setForceAdopt(event.target.checked)}
          />
          <small>Allow force adopt if blocked</small>
        </label>
      </article>

      <article className="fo-card">
        <strong>Branch Lineage</strong>
        {(lineageQuery.data?.nodes || []).map((node, index) => (
          <small key={node.branchId}>
            {index + 1}. {node.name} · {node.status}
            {node.adoptedAtMs ? ` · adopted ${new Date(node.adoptedAtMs).toLocaleDateString()}` : ''}
          </small>
        ))}
        {lineageQuery.data?.hasCycle ? <small>Cycle detected in lineage.</small> : null}
        {(lineageQuery.data?.nodes || []).length === 0 ? (
          <small>No lineage available.</small>
        ) : null}
      </article>

      <article className="fo-card">
        <strong>Mutation Timeline</strong>
        <small>
          {selectedBranch?.name || 'No selected branch'} ·{' '}
          {mutationsQuery.data?.length || 0} mutation(s)
        </small>
        {(mutationsQuery.data || []).slice(0, 8).map(mutation => (
          <small key={mutation.id}>
            {new Date(mutation.createdAtMs).toLocaleTimeString()} · {mutation.kind} · Δamount{' '}
            {Number((mutation.payload as Record<string, unknown>).amountDelta || 0)} · Δrisk{' '}
            {Number((mutation.payload as Record<string, unknown>).riskDelta || 0)}
          </small>
        ))}
        {(mutationsQuery.data || []).length === 0 ? (
          <small>No mutations recorded yet.</small>
        ) : null}
      </article>
    </section>
  );
}
