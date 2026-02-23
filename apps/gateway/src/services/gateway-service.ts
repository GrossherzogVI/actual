import type { GatewayQueue } from '../queue/types';
import type { GatewayRepository } from '../repositories/types';

import { createAutopilotService } from './autopilot-service';
import { createCommandMeshService } from './command-mesh-service';
import { createDelegateService } from './delegate-service';
import { createFocusService } from './focus-service';
import { createOpsActivityService } from './ops-activity-service';
import { createPolicyService } from './policy-service';
import { createRuntimeService } from './runtime-service';
import { createScenarioService } from './scenario-service';
import { createTemporalService } from './temporal-service';
import { createWorkflowService } from './workflow-service';

export type GatewayService = ReturnType<typeof createGatewayService>;

export function createGatewayService(
  repository: GatewayRepository,
  queue: GatewayQueue,
) {
  // --- Ops Activity (no external deps, provides appendOpsActivityEvent) ---
  const opsActivity = createOpsActivityService(repository);

  // --- Policy ---
  const policy = createPolicyService(repository, {
    appendOpsActivityEvent: opsActivity.appendOpsActivityEvent,
  });

  // --- Focus ---
  const focus = createFocusService(repository, {
    appendOpsActivityEvent: opsActivity.appendOpsActivityEvent,
  });

  // --- Delegate ---
  const delegate = createDelegateService(repository, queue, {
    appendOpsActivityEvent: opsActivity.appendOpsActivityEvent,
  });

  // --- Autopilot (rollback logic) ---
  const autopilot = createAutopilotService(repository, queue, {
    appendOpsActivityEvent: opsActivity.appendOpsActivityEvent,
  });

  // --- Workflow (needs executeWorkflowCommandChain + rollbackPlaybookRun) ---
  // Forward-declared so command-mesh and workflow can reference each other.
  const workflowDeps = {
    appendOpsActivityEvent: opsActivity.appendOpsActivityEvent,
    executeWorkflowCommandChain: (...args: Parameters<typeof commandMesh.executeWorkflowCommandChain>) =>
      commandMesh.executeWorkflowCommandChain(...args),
    rollbackPlaybookRun: autopilot.rollbackPlaybookRun,
  };
  const workflow = createWorkflowService(repository, queue, workflowDeps);

  // --- Command Mesh (needs many cross-service deps) ---
  const commandMesh = createCommandMeshService(repository, queue, {
    appendOpsActivityEvent: opsActivity.appendOpsActivityEvent,
    resolveNextAction: focus.resolveNextAction,
    getMoneyPulse: focus.getMoneyPulse,
    runCloseRoutine: workflow.runCloseRoutine,
    applyBatchPolicy: workflow.applyBatchPolicy,
    createPlaybook: workflow.createPlaybook,
    listPlaybooks: workflow.listPlaybooks,
    runPlaybook: workflow.runPlaybook,
    assignDelegateLane: delegate.assignDelegateLane,
    commentDelegateLane: delegate.commentDelegateLane,
    rollbackCommandRun: autopilot.rollbackCommandRun,
  });

  // --- Scenario ---
  const scenario = createScenarioService(repository, queue, {
    appendOpsActivityEvent: opsActivity.appendOpsActivityEvent,
    executeWorkflowCommandChain: commandMesh.executeWorkflowCommandChain,
  });

  // --- Temporal ---
  const temporal = createTemporalService(repository);

  // --- Runtime (queue ops, dead letters, ledger, metrics) ---
  const runtime = createRuntimeService(repository, queue, {
    appendOpsActivityEvent: opsActivity.appendOpsActivityEvent,
  });

  return {
    repository,
    queue,

    // Focus
    resolveNextAction: focus.resolveNextAction,
    getMoneyPulse: focus.getMoneyPulse,
    getNarrativePulse: focus.getNarrativePulse,
    getAdaptiveFocusPanel: focus.getAdaptiveFocusPanel,
    recordActionOutcome: focus.recordActionOutcome,
    listActionOutcomes: focus.listActionOutcomes,
    recommend: focus.recommend,
    explain: focus.explain,
    classify: focus.classify,
    forecast: focus.forecast,

    // Workflow
    listPlaybooks: workflow.listPlaybooks,
    listPlaybookRuns: workflow.listPlaybookRuns,
    createPlaybook: workflow.createPlaybook,
    runPlaybook: workflow.runPlaybook,
    replayPlaybookRun: workflow.replayPlaybookRun,
    runCloseRoutine: workflow.runCloseRoutine,
    listCloseRuns: workflow.listCloseRuns,
    applyBatchPolicy: workflow.applyBatchPolicy,

    // Command Mesh
    listWorkflowCommandRuns: commandMesh.listWorkflowCommandRuns,
    listWorkflowCommandRunsByIds: commandMesh.listWorkflowCommandRunsByIds,
    executeWorkflowCommandChain: commandMesh.executeWorkflowCommandChain,

    // Autopilot
    rollbackCommandRun: autopilot.rollbackCommandRun,
    rollbackPlaybookRun: autopilot.rollbackPlaybookRun,

    // Ops Activity
    listOpsActivity: opsActivity.listOpsActivity,
    backfillOpsActivity: opsActivity.backfillOpsActivity,
    runOpsActivityMaintenance: opsActivity.runOpsActivityMaintenance,
    getOpsActivityPipelineStatus: opsActivity.getOpsActivityPipelineStatus,
    startOpsActivityPipeline: opsActivity.startOpsActivityPipeline,

    // Delegate
    listDelegateLanes: delegate.listDelegateLanes,
    listDelegateLaneEvents: delegate.listDelegateLaneEvents,
    assignDelegateLane: delegate.assignDelegateLane,
    transitionDelegateLane: delegate.transitionDelegateLane,
    commentDelegateLane: delegate.commentDelegateLane,

    // Scenario
    listScenarioBranches: scenario.listScenarioBranches,
    createScenarioBranch: scenario.createScenarioBranch,
    simulateScenarioBranch: scenario.simulateScenarioBranch,
    promoteScenarioBranchToRun: scenario.promoteScenarioBranchToRun,
    listScenarioMutations: scenario.listScenarioMutations,
    applyScenarioMutation: scenario.applyScenarioMutation,
    compareScenarioOutcomes: scenario.compareScenarioOutcomes,
    getScenarioAdoptionCheck: scenario.getScenarioAdoptionCheck,
    getScenarioLineage: scenario.getScenarioLineage,
    adoptScenarioBranch: scenario.adoptScenarioBranch,

    // Temporal
    getTemporalSignals: temporal.getTemporalSignals,

    // Policy
    getEgressPolicy: policy.getEgressPolicy,
    setEgressPolicy: policy.setEgressPolicy,
    listEgressAudit: policy.listEgressAudit,
    recordEgressAudit: policy.recordEgressAudit,

    // Runtime
    learnCorrection: runtime.learnCorrection,
    submitLedgerCommand: runtime.submitLedgerCommand,
    streamLedgerEvents: runtime.streamLedgerEvents,
    getProjectionSnapshot: runtime.getProjectionSnapshot,
    claimQueueJobs: runtime.claimQueueJobs,
    claimWorkerJobFingerprint: runtime.claimWorkerJobFingerprint,
    ackQueueJob: runtime.ackQueueJob,
    requeueExpiredQueueJobs: runtime.requeueExpiredQueueJobs,
    checkWorkerJobFingerprint: runtime.checkWorkerJobFingerprint,
    listWorkerDeadLetters: runtime.listWorkerDeadLetters,
    replayWorkerDeadLetters: runtime.replayWorkerDeadLetters,
    resolveWorkerDeadLetter: runtime.resolveWorkerDeadLetter,
    reopenWorkerDeadLetter: runtime.reopenWorkerDeadLetter,
    getWorkerQueueHealth: runtime.getWorkerQueueHealth,
    acquireWorkerQueueLease: runtime.acquireWorkerQueueLease,
    releaseWorkerQueueLease: runtime.releaseWorkerQueueLease,
    getRuntimeMetrics: runtime.getRuntimeMetrics,
  };
}
