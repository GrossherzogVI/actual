import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

type SpatialTwinPanelProps = {
  onStatus?: (status: string) => void;
};

type CheckpointLevel = 'pass' | 'warn' | 'fail';

type Checkpoint = {
  id: string;
  label: string;
  level: CheckpointLevel;
  detail: string;
};

const BRANCH_COLORS = ['var(--fo-info)', 'var(--fo-ok)', 'var(--fo-accent)', '#f97316'];

function asNumber(input: string, fallback: number): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function clampAbs(value: number, max = 1000): number {
  return Math.min(max, Math.abs(value));
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${fallback}: ${error.message}`;
  }
  return fallback;
}

function checkpointClass(level: CheckpointLevel): string {
  return `fo-spatial-checkpoint fo-spatial-checkpoint-${level}`;
}

function metricClass(value: number): string {
  if (value > 0) return 'fo-spatial-metric-positive';
  if (value < 0) return 'fo-spatial-metric-negative';
  return 'fo-spatial-metric-neutral';
}

export function SpatialTwinPanel({ onStatus }: SpatialTwinPanelProps) {
  const queryClient = useQueryClient();
  const [branchName, setBranchName] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);
  const [amountDelta, setAmountDelta] = useState('150');
  const [riskDelta, setRiskDelta] = useState('-1');
  const [forceAdopt, setForceAdopt] = useState(false);

  const branchesQuery = useQuery({
    queryKey: ['scenario-branches'],
    queryFn: apiClient.listScenarioBranches,
  });

  const branches = branchesQuery.data || [];
  const selectedBranch =
    branches.find(branch => branch.id === selectedBranchId) || null;
  const comparisonTarget =
    branches.find(branch => branch.id === compareTargetId) || null;

  useEffect(() => {
    if (!selectedBranchId && branches[0]) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, selectedBranchId]);

  useEffect(() => {
    if (!selectedBranch) {
      setCompareTargetId(null);
      return;
    }
    const targetStillValid = branches.some(branch => branch.id === compareTargetId);
    if (
      !targetStillValid ||
      compareTargetId === selectedBranch.id
    ) {
      const fallback = branches.find(branch => branch.id !== selectedBranch.id);
      setCompareTargetId(fallback ? fallback.id : null);
    }
  }, [branches, compareTargetId, selectedBranch]);

  const compareQuery = useQuery({
    queryKey: ['scenario-compare', selectedBranch?.id, comparisonTarget?.id],
    enabled: !!selectedBranch,
    queryFn: () =>
      apiClient.compareScenario(selectedBranch!.id, comparisonTarget?.id || undefined),
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
      apiClient.getScenarioAdoptionCheck(
        selectedBranch!.id,
        comparisonTarget?.id || undefined,
      ),
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
      return apiClient.createScenarioBranch(label, selectedBranch?.id || undefined);
    },
    onSuccess: async created => {
      setBranchName('');
      setSelectedBranchId(created.id);
      setForceAdopt(false);
      if (onStatus) {
        onStatus(`Created scenario branch ${created.name}.`);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['scenario-branches'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-adoption-check'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-lineage'] }),
      ]);
    },
    onError: error => {
      if (onStatus) {
        onStatus(errorMessage(error, 'Create branch failed'));
      }
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBranch) return null;

      const numericAmount = asNumber(amountDelta, 0);
      const numericRisk = asNumber(riskDelta, 0);

      return apiClient.applyScenarioMutation(selectedBranch.id, 'manual-adjustment', {
        amountDelta: numericAmount,
        riskDelta: numericRisk,
      });
    },
    onSuccess: async () => {
      if (onStatus) {
        onStatus('Applied scenario mutation.');
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['scenario-branches'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-compare'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-mutations'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-adoption-check'] }),
      ]);
    },
    onError: error => {
      if (onStatus) {
        onStatus(errorMessage(error, 'Apply mutation failed'));
      }
    },
  });

  const adoptBranch = useMutation({
    mutationFn: async (input: { branchId: string; force?: boolean }) =>
      apiClient.adoptScenarioBranch(input.branchId, {
        force: input.force,
        againstBranchId:
          selectedBranch?.id === input.branchId ? comparisonTarget?.id || undefined : undefined,
      }),
    onSuccess: async adopted => {
      setForceAdopt(false);
      if (onStatus) {
        onStatus(`Adopted scenario branch ${adopted.name}.`);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['scenario-branches'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-adoption-check'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-lineage'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-compare'] }),
      ]);
    },
    onError: error => {
      if (onStatus) {
        onStatus(errorMessage(error, 'Adopt branch failed'));
      }
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

  const diffAmount = Number(compareQuery.data?.diff.amountDelta || 0);
  const diffRisk = Number(compareQuery.data?.diff.riskDelta || 0);
  const riskScore = Number(adoptionCheckQuery.data?.riskScore || 0);
  const blockers = adoptionCheckQuery.data?.blockers || [];
  const warnings = adoptionCheckQuery.data?.warnings || [];
  const mutationCount = Number(adoptionCheckQuery.data?.mutationCount || 0);
  const canAdopt = !!adoptionCheckQuery.data?.canAdopt;
  const hasCriticalBlockers = blockers.length > 0;

  const checkpoints = useMemo<Checkpoint[]>(
    () => [
      {
        id: 'branch-selected',
        label: 'Branch selected',
        level: selectedBranch ? 'pass' : 'fail',
        detail: selectedBranch ? selectedBranch.name : 'Select a branch to continue.',
      },
      {
        id: 'guardrails',
        label: 'Guardrail blockers',
        level:
          !selectedBranch || !adoptionCheckQuery.data
            ? 'warn'
            : blockers.length === 0
              ? 'pass'
              : 'fail',
        detail:
          !selectedBranch || !adoptionCheckQuery.data
            ? 'Waiting for adoption check.'
            : blockers.length === 0
              ? 'No blockers detected.'
              : `${blockers.length} blocker(s) need resolution or force-adopt.`,
      },
      {
        id: 'risk',
        label: 'Risk checkpoint',
        level:
          !selectedBranch || !adoptionCheckQuery.data
            ? 'warn'
            : riskScore >= 85
              ? 'fail'
              : riskScore >= 60
                ? 'warn'
                : 'pass',
        detail:
          !selectedBranch || !adoptionCheckQuery.data
            ? 'No risk score yet.'
            : `Risk score ${riskScore}.`,
      },
      {
        id: 'mutation-depth',
        label: 'Mutation depth',
        level: mutationCount === 0 ? 'warn' : mutationCount > 12 ? 'warn' : 'pass',
        detail:
          mutationCount === 0
            ? 'No mutations yet.'
            : `${mutationCount} mutation(s) in current branch.`,
      },
    ],
    [adoptionCheckQuery.data, blockers.length, mutationCount, riskScore, selectedBranch],
  );

  const safeAdoptDisabled =
    !selectedBranch ||
    adoptBranch.isPending ||
    (!canAdopt && adoptionCheckQuery.data !== null);
  const forceAdoptDisabled =
    !selectedBranch || adoptBranch.isPending || !forceAdopt;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'b' && !createBranch.isPending) {
        event.preventDefault();
        createBranch.mutate();
      }
      if (key === 'm' && selectedBranch && !applyMutation.isPending) {
        event.preventDefault();
        applyMutation.mutate();
      }
      if (key === 'a' && !safeAdoptDisabled && selectedBranch) {
        event.preventDefault();
        adoptBranch.mutate({ branchId: selectedBranch.id, force: false });
      }
      if (key === 'f' && !forceAdoptDisabled && selectedBranch) {
        event.preventDefault();
        adoptBranch.mutate({ branchId: selectedBranch.id, force: true });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    adoptBranch,
    applyMutation,
    createBranch,
    forceAdoptDisabled,
    safeAdoptDisabled,
    selectedBranch,
  ]);

  return (
    <section className="fo-panel fo-twin-panel" id="spatial-twin">
      <header className="fo-panel-header">
        <h2>Spatial Finance Twin</h2>
        <small>Branch, mutate, compare, and adopt through checkpointed decision flow.</small>
      </header>

      <article className="fo-spatial-hud">
        <div className="fo-space-between">
          <strong>Diff HUD</strong>
          <small>
            {selectedBranch?.name || 'no branch'} vs {comparisonTarget?.name || 'baseline'}
          </small>
        </div>

        <div className="fo-spatial-metric-grid">
          <article className={`fo-card ${metricClass(diffAmount)}`}>
            <small>Amount Delta</small>
            <strong>{diffAmount >= 0 ? '+' : ''}{diffAmount.toFixed(2)}</strong>
            <div className="fo-spatial-bar-track">
              <span
                className="fo-spatial-bar-fill"
                style={{ width: `${Math.min(100, (clampAbs(diffAmount) / 1000) * 100)}%` }}
              />
            </div>
          </article>

          <article className={`fo-card ${metricClass(diffRisk)}`}>
            <small>Risk Delta</small>
            <strong>{diffRisk >= 0 ? '+' : ''}{diffRisk.toFixed(2)}</strong>
            <div className="fo-spatial-bar-track">
              <span
                className="fo-spatial-bar-fill fo-spatial-bar-fill-risk"
                style={{ width: `${Math.min(100, (clampAbs(diffRisk) / 20) * 100)}%` }}
              />
            </div>
          </article>

          <article className={`fo-card ${riskScore >= 85 ? 'fo-spatial-metric-negative' : riskScore >= 60 ? 'fo-spatial-metric-neutral' : 'fo-spatial-metric-positive'}`}>
            <small>Adoption Risk Score</small>
            <strong>{riskScore || '-'}</strong>
            <small>{adoptionCheckQuery.data?.summary || 'Run adoption check.'}</small>
          </article>
        </div>

        <div className="fo-spatial-checkpoint-list">
          {checkpoints.map(checkpoint => (
            <article key={checkpoint.id} className={checkpointClass(checkpoint.level)}>
              <div className="fo-space-between">
                <strong>{checkpoint.label}</strong>
                <small>{checkpoint.level}</small>
              </div>
              <small>{checkpoint.detail}</small>
            </article>
          ))}
        </div>

        <div className="fo-row mt-2">
          <Button
            variant="secondary"
            disabled={safeAdoptDisabled}
            onClick={() => {
              if (!selectedBranch) {
                return;
              }
              adoptBranch.mutate({ branchId: selectedBranch.id, force: false });
            }}
          >
            Adopt Selected
          </Button>
          <Button
            variant="secondary"
            disabled={forceAdoptDisabled}
            onClick={() => {
              if (!selectedBranch) {
                return;
              }
              adoptBranch.mutate({ branchId: selectedBranch.id, force: true });
            }}
          >
            Force Adopt
          </Button>
        </div>
      </article>

      <div className="fo-row">
        <Input
          value={branchName}
          onChange={event => setBranchName(event.target.value)}
          placeholder="Create scenario branch"
        />
        <Button
          disabled={createBranch.isPending}
          onClick={() => createBranch.mutate()}
        >
          {createBranch.isPending ? 'Creating' : 'Branch'}
        </Button>
      </div>

      <div className="fo-row">
        <label className="fo-space-between fo-spatial-compare-select w-full max-w-[300px]">
          <small className="mr-4">Compare target</small>
          <Select
            value={compareTargetId || 'baseline'}
            onValueChange={value => setCompareTargetId(value === 'baseline' ? null : value)}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Compare target" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="baseline">baseline</SelectItem>
              {branches
                .filter(branch => branch.id !== selectedBranchId)
                .map(branch => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </label>
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
            <div className="fo-row mt-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSelectedBranchId(node.branch.id)}
              >
                Select
              </Button>
              <Button
                size="sm"
                variant="secondary"
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
              </Button>
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
        <Input
          value={amountDelta}
          onChange={event => setAmountDelta(event.target.value)}
          placeholder="Amount delta"
        />
        <Input
          value={riskDelta}
          onChange={event => setRiskDelta(event.target.value)}
          placeholder="Risk delta"
        />
        <Button
          disabled={!selectedBranch || applyMutation.isPending}
          onClick={() => applyMutation.mutate()}
        >
          {applyMutation.isPending ? 'Applying' : 'Apply Mutation'}
        </Button>
      </div>

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
          <small>
            Arm force-adopt override {hasCriticalBlockers ? '(blockers detected)' : '(optional)'}
          </small>
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

      <div className="fo-hints">
        <code>alt+shift+b branch</code>
        <code>alt+shift+m mutate</code>
        <code>alt+shift+a adopt safe</code>
        <code>alt+shift+f force adopt</code>
      </div>
    </section>
  );
}
