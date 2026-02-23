import type { GatewayQueue } from '../queue/types';
import type { GatewayRepository } from '../repositories/types';
import type {
  OpsActivityEvent,
  ScenarioAdoptionCheck,
  ScenarioBranch,
  ScenarioBranchPromotionResult,
  ScenarioComparison,
  ScenarioLineage,
  ScenarioLineageNode,
  ScenarioMutation,
  ScenarioSimulationResult,
  WorkflowCommandExecution,
} from '../types';

import {
  type ExecutionOptionsInput,
  deriveSimulationDelta,
  mutationChain,
  nanoid,
  queueJob,
  toScenarioAdoptionActivity,
} from './helpers';

export type ScenarioDeps = {
  appendOpsActivityEvent: (event: OpsActivityEvent) => Promise<void>;
  executeWorkflowCommandChain: (input: {
    chain: string;
    assignee?: string;
    options?: ExecutionOptionsInput;
    actorId?: string;
    sourceSurface?: string;
    persist?: boolean;
  }) => Promise<WorkflowCommandExecution>;
};

export function createScenarioService(
  repository: GatewayRepository,
  queue: GatewayQueue,
  deps: ScenarioDeps,
) {
  async function listScenarioBranches(): Promise<ScenarioBranch[]> {
    return repository.listScenarioBranches();
  }

  async function selectSimulationBaseBranch(
    preferredBaseBranchId?: string,
  ): Promise<ScenarioBranch | undefined> {
    const branches = await repository.listScenarioBranches();
    if (branches.length === 0) {
      return undefined;
    }

    if (preferredBaseBranchId) {
      const preferred = branches.find(
        branch => branch.id === preferredBaseBranchId,
      );
      if (preferred) {
        return preferred;
      }
    }

    const adopted = branches
      .filter(branch => branch.status === 'adopted')
      .sort(
        (a, b) =>
          (b.adoptedAtMs || 0) - (a.adoptedAtMs || 0) ||
          b.updatedAtMs - a.updatedAtMs,
      )[0];
    if (adopted) {
      return adopted;
    }

    return branches.slice().sort((a, b) => b.updatedAtMs - a.updatedAtMs)[0];
  }

  async function createScenarioBranch(input: {
    name: string;
    baseBranchId?: string;
    notes?: string;
  }): Promise<ScenarioBranch> {
    const now = Date.now();
    const branch: ScenarioBranch = {
      id: nanoid(),
      name: input.name,
      status: 'draft',
      baseBranchId: input.baseBranchId,
      notes: input.notes,
      createdAtMs: now,
      updatedAtMs: now,
    };

    await repository.createScenarioBranch(branch);
    await queue.enqueue(
      queueJob('scenario.branch.created', {
        branchId: branch.id,
      }),
    );

    return branch;
  }

  async function listScenarioMutations(
    branchId: string,
  ): Promise<ScenarioMutation[]> {
    return repository.listScenarioMutations(branchId);
  }

  async function applyScenarioMutation(input: {
    branchId: string;
    mutationKind: string;
    payload: Record<string, unknown>;
  }): Promise<ScenarioMutation | null> {
    const mutation: ScenarioMutation = {
      id: nanoid(),
      branchId: input.branchId,
      kind: input.mutationKind,
      payload: input.payload,
      createdAtMs: Date.now(),
    };

    const created = await repository.addScenarioMutation(mutation);
    if (!created) return null;

    await queue.enqueue(
      queueJob('scenario.mutation.applied', {
        mutationId: created.id,
        branchId: created.branchId,
      }),
    );

    return created;
  }

  async function simulateScenarioBranch(input: {
    label?: string;
    chain: string;
    source: ScenarioSimulationResult['source'];
    expectedImpact?: string;
    confidence?: number;
    amountDelta?: number;
    riskDelta?: number;
    preferredBaseBranchId?: string;
    notes?: string;
    recommendationId?: string;
    actorId?: string;
  }): Promise<ScenarioSimulationResult> {
    const now = Date.now();
    const baseBranch = await selectSimulationBaseBranch(
      input.preferredBaseBranchId,
    );
    const delta = deriveSimulationDelta({
      expectedImpact: input.expectedImpact,
      confidence: input.confidence,
      amountDelta: input.amountDelta,
      riskDelta: input.riskDelta,
    });

    const notes = [
      typeof input.notes === 'string' && input.notes.trim().length > 0
        ? input.notes.trim()
        : undefined,
      `Source: ${input.source}`,
      `Chain: ${input.chain}`,
      input.recommendationId
        ? `Recommendation: ${input.recommendationId}`
        : undefined,
    ]
      .filter(
        (part): part is string => typeof part === 'string' && part.length > 0,
      )
      .join('\n');

    const branch = await createScenarioBranch({
      name:
        typeof input.label === 'string' && input.label.trim().length > 0
          ? input.label.trim()
          : 'Simulation branch',
      baseBranchId: baseBranch?.id,
      notes,
    });

    const mutation = await applyScenarioMutation({
      branchId: branch.id,
      mutationKind: 'manual-adjustment',
      payload: {
        amountDelta: delta.amountDelta,
        riskDelta: delta.riskDelta,
        source: input.source,
        chain: input.chain,
        expectedImpact: input.expectedImpact,
        confidence:
          typeof input.confidence === 'number' &&
          Number.isFinite(input.confidence)
            ? input.confidence
            : undefined,
        recommendationId: input.recommendationId,
        actorId: input.actorId || 'owner',
        simulatedAtMs: now,
      },
    });

    if (!mutation) {
      throw new Error('simulation-mutation-failed');
    }

    await queue.enqueue(
      queueJob('scenario.branch.simulated', {
        branchId: branch.id,
        mutationId: mutation.id,
        source: input.source,
        chain: input.chain,
        actorId: input.actorId || 'owner',
      }),
    );

    return {
      branch,
      mutation,
      amountDelta: delta.amountDelta,
      riskDelta: delta.riskDelta,
      baseBranchId: baseBranch?.id,
      source: input.source,
      chain: input.chain,
      simulatedAtMs: now,
      expectedImpact: input.expectedImpact,
      recommendationId: input.recommendationId,
    };
  }

  async function compareScenarioOutcomes(
    branchId: string,
    againstBranchId?: string,
  ): Promise<ScenarioComparison | null> {
    const primaryBranch = await repository.getScenarioBranchById(branchId);
    if (!primaryBranch) return null;

    const againstBranch = againstBranchId
      ? await repository.getScenarioBranchById(againstBranchId)
      : null;

    const summarize = async (id?: string) => {
      if (!id) {
        return { amountDelta: 0, riskDelta: 0 };
      }

      const mutations = await repository.listScenarioMutations(id);
      return mutations.reduce(
        (acc, mutation) => {
          const amountDelta = mutation.payload.amountDelta;
          const riskDelta = mutation.payload.riskDelta;

          acc.amountDelta += typeof amountDelta === 'number' ? amountDelta : 0;
          acc.riskDelta += typeof riskDelta === 'number' ? riskDelta : 0;
          return acc;
        },
        { amountDelta: 0, riskDelta: 0 },
      );
    };

    const primary = await summarize(primaryBranch.id);
    const against = await summarize(againstBranch?.id);

    return {
      primaryBranchId: primaryBranch.id,
      againstBranchId: againstBranch?.id,
      primary,
      against,
      diff: {
        amountDelta: primary.amountDelta - against.amountDelta,
        riskDelta: primary.riskDelta - against.riskDelta,
      },
    };
  }

  async function getScenarioLineage(
    branchId: string,
  ): Promise<ScenarioLineage | null> {
    const branches = await repository.listScenarioBranches();
    const byId = new Map(branches.map(branch => [branch.id, branch]));
    const target = byId.get(branchId);
    if (!target) return null;

    const visited = new Set<string>();
    const reverse: ScenarioLineageNode[] = [];
    let current: ScenarioBranch | undefined = target;
    let hasCycle = false;

    while (current) {
      if (visited.has(current.id)) {
        hasCycle = true;
        break;
      }
      visited.add(current.id);
      reverse.push({
        branchId: current.id,
        name: current.name,
        status: current.status,
        adoptedAtMs: current.adoptedAtMs,
      });

      if (!current.baseBranchId) {
        break;
      }
      current = byId.get(current.baseBranchId);
      if (!current) {
        break;
      }
    }

    return {
      branchId,
      nodes: reverse.reverse(),
      hasCycle,
    };
  }

  async function getScenarioAdoptionCheck(input: {
    branchId: string;
    againstBranchId?: string;
  }): Promise<ScenarioAdoptionCheck | null> {
    const branch = await repository.getScenarioBranchById(input.branchId);
    if (!branch) return null;

    let againstBranchId = input.againstBranchId;
    if (!againstBranchId) {
      const adoptedBaseline = (await repository.listScenarioBranches())
        .filter(
          candidate =>
            candidate.status === 'adopted' && candidate.id !== branch.id,
        )
        .sort(
          (a, b) =>
            (b.adoptedAtMs || 0) - (a.adoptedAtMs || 0) ||
            b.updatedAtMs - a.updatedAtMs,
        )[0];
      againstBranchId = adoptedBaseline?.id;
    }

    const comparison = await compareScenarioOutcomes(
      branch.id,
      againstBranchId,
    );
    if (!comparison) return null;

    const mutations = await repository.listScenarioMutations(branch.id);
    const lineage = await getScenarioLineage(branch.id);
    if (!lineage) return null;

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (branch.status === 'adopted') {
      blockers.push('Branch is already adopted.');
    }
    if (lineage.hasCycle) {
      blockers.push('Scenario lineage cycle detected.');
    }
    if (mutations.length === 0) {
      warnings.push(
        'Branch has no mutations; adoption has no measurable change.',
      );
    }
    if (lineage.nodes.length >= 6) {
      warnings.push(
        `Lineage depth is ${lineage.nodes.length}, increasing rollback complexity.`,
      );
    }

    const amountDelta = comparison.diff.amountDelta;
    const riskDelta = comparison.diff.riskDelta;
    if (riskDelta >= 6) {
      warnings.push(`Risk delta is elevated (${riskDelta}).`);
    }
    if (riskDelta >= 10) {
      blockers.push(`Risk delta is too high for safe adoption (${riskDelta}).`);
    }
    if (amountDelta <= -500) {
      warnings.push(`Projected cashflow delta is negative (${amountDelta}).`);
    }
    if (amountDelta <= -2000) {
      blockers.push(
        `Projected cashflow downside exceeds threshold (${amountDelta}).`,
      );
    }

    const riskScoreRaw = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          Math.abs(riskDelta) * 8 +
            (amountDelta < 0 ? Math.min(45, Math.abs(amountDelta) / 80) : 0) +
            mutations.length * 2 +
            Math.max(0, lineage.nodes.length - 1) * 3,
        ),
      ),
    );
    const riskScore = Math.max(
      riskScoreRaw,
      blockers.length * 25 + warnings.length * 10,
    );
    const canAdopt = blockers.length === 0;

    return {
      branchId: branch.id,
      againstBranchId: comparison.againstBranchId,
      canAdopt,
      riskScore,
      blockers,
      warnings,
      summary: canAdopt
        ? `Adoption ready with risk score ${riskScore}.`
        : `Adoption blocked with risk score ${riskScore}.`,
      comparison,
      mutationCount: mutations.length,
      lineageDepth: lineage.nodes.length,
      checkedAtMs: Date.now(),
    };
  }

  async function adoptScenarioBranch(input: {
    branchId: string;
    force?: boolean;
    actorId?: string;
    againstBranchId?: string;
  }): Promise<
    | { ok: true; branch: ScenarioBranch; check: ScenarioAdoptionCheck }
    | {
        ok: false;
        error: 'branch-not-found' | 'adoption-blocked';
        check?: ScenarioAdoptionCheck;
      }
  > {
    const check = await getScenarioAdoptionCheck({
      branchId: input.branchId,
      againstBranchId: input.againstBranchId,
    });
    if (!check) {
      return {
        ok: false,
        error: 'branch-not-found',
      };
    }
    if (!check.canAdopt && !input.force) {
      return {
        ok: false,
        error: 'adoption-blocked',
        check,
      };
    }

    const adoptedAtMs = Date.now();
    const branch = await repository.adoptScenarioBranch(
      input.branchId,
      adoptedAtMs,
    );
    if (!branch) {
      return {
        ok: false,
        error: 'branch-not-found',
      };
    }

    await queue.enqueue(
      queueJob('scenario.branch.adopted', {
        branchId: input.branchId,
        actorId: input.actorId || 'owner',
        force: !!input.force,
        riskScore: check.riskScore,
        blockerCount: check.blockers.length,
        warningCount: check.warnings.length,
      }),
    );

    const adoptionActivity = toScenarioAdoptionActivity(
      branch,
      check.riskScore,
    );
    await deps.appendOpsActivityEvent({
      ...adoptionActivity,
      meta: {
        ...(adoptionActivity.meta || {}),
        force: !!input.force,
      },
    });

    return {
      ok: true,
      branch,
      check,
    };
  }

  async function promoteScenarioBranchToRun(input: {
    branchId: string;
    mutationId?: string;
    assignee?: string;
    sourceSurface?: string;
    note?: string;
    actorId?: string;
    options?: ExecutionOptionsInput;
  }): Promise<
    | { ok: true; result: ScenarioBranchPromotionResult }
    | {
        ok: false;
        error:
          | 'branch-not-found'
          | 'source-mutation-not-found'
          | 'source-mutation-chain-missing';
      }
  > {
    const branch = await repository.getScenarioBranchById(input.branchId);
    if (!branch) {
      return {
        ok: false,
        error: 'branch-not-found',
      };
    }

    const mutations = await repository.listScenarioMutations(branch.id);
    const orderedMutations = mutations
      .slice()
      .sort(
        (a, b) =>
          b.createdAtMs - a.createdAtMs ||
          (a.id === b.id ? 0 : a.id < b.id ? 1 : -1),
      );

    const sourceMutation = input.mutationId
      ? orderedMutations.find(mutation => mutation.id === input.mutationId)
      : orderedMutations.find(mutation => !!mutationChain(mutation));

    if (!sourceMutation) {
      return {
        ok: false,
        error: 'source-mutation-not-found',
      };
    }

    const chain = mutationChain(sourceMutation);
    if (!chain) {
      return {
        ok: false,
        error: 'source-mutation-chain-missing',
      };
    }

    const actorId = input.actorId || 'owner';
    const sourceSurface = input.sourceSurface || 'spatial-twin';
    const promotedAtMs = Date.now();
    const run = await deps.executeWorkflowCommandChain({
      chain,
      assignee: input.assignee,
      options: input.options,
      actorId,
      sourceSurface,
    });

    const source = sourceMutation.payload.source;
    const recommendationId = sourceMutation.payload.recommendationId;
    const promotionMutation = await applyScenarioMutation({
      branchId: branch.id,
      mutationKind: 'run-promotion-link',
      payload: {
        sourceMutationId: sourceMutation.id,
        source:
          typeof source === 'string' && source.length > 0 ? source : 'manual',
        recommendationId:
          typeof recommendationId === 'string' && recommendationId.length > 0
            ? recommendationId
            : undefined,
        chain,
        runId: run.id,
        runStatus: run.status,
        runExecutionMode: run.executionMode,
        runGuardrailProfile: run.guardrailProfile,
        runRollbackEligible: run.rollbackEligible,
        runRollbackWindowUntilMs: run.rollbackWindowUntilMs,
        actorId,
        sourceSurface,
        note: input.note,
        promotedAtMs,
      },
    });

    if (!promotionMutation) {
      throw new Error('scenario-promotion-mutation-failed');
    }

    await queue.enqueue(
      queueJob('scenario.branch.promoted-run', {
        branchId: branch.id,
        sourceMutationId: sourceMutation.id,
        promotionMutationId: promotionMutation.id,
        runId: run.id,
        status: run.status,
        executionMode: run.executionMode,
        actorId,
        sourceSurface,
      }),
    );

    return {
      ok: true,
      result: {
        branch,
        sourceMutation,
        promotionMutation,
        run,
        chain,
        promotedAtMs,
      },
    };
  }

  return {
    listScenarioBranches,
    createScenarioBranch,
    simulateScenarioBranch,
    promoteScenarioBranchToRun,
    listScenarioMutations,
    applyScenarioMutation,
    compareScenarioOutcomes,
    getScenarioAdoptionCheck,
    getScenarioLineage,
    adoptScenarioBranch,
  };
}
