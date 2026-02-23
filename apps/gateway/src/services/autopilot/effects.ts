import type { EffectSummary, ExecutionMode } from '../../types';

type EffectTemplate = {
  kind: string;
  description: string;
  reversible: boolean;
};

const STEP_EFFECTS: Record<string, EffectTemplate> = {
  'resolve-next-action': {
    kind: 'focus.resolve-next',
    description: 'Resolved next action suggestion.',
    reversible: true,
  },
  'open-expiring-contracts': {
    kind: 'navigation.open-expiring-contracts',
    description: 'Opened expiring contracts lane.',
    reversible: true,
  },
  'open-urgent-review': {
    kind: 'navigation.open-urgent-review',
    description: 'Opened urgent review lane.',
    reversible: true,
  },
  'refresh-command-center': {
    kind: 'ui.refresh-command-center',
    description: 'Refreshed command center context.',
    reversible: true,
  },
  'run-close-weekly': {
    kind: 'workflow.run-close-weekly',
    description: 'Executed weekly close routine.',
    reversible: false,
  },
  'run-close-monthly': {
    kind: 'workflow.run-close-monthly',
    description: 'Executed monthly close routine.',
    reversible: false,
  },
  'run-close-safe': {
    kind: 'workflow.run-close-safe',
    description: 'Executed guardrail-aware close routine.',
    reversible: false,
  },
  'assign-expiring-contracts-lane': {
    kind: 'delegate.assign-contract-lane',
    description: 'Assigned expiring contracts delegate lane.',
    reversible: false,
  },
  'delegate-triage-batch': {
    kind: 'delegate.assign-triage-batch',
    description: 'Assigned delegate triage batch lane.',
    reversible: false,
  },
  'create-default-playbook': {
    kind: 'playbook.create-default',
    description: 'Created default playbook.',
    reversible: false,
  },
  'run-first-playbook': {
    kind: 'playbook.run-first',
    description: 'Executed first available playbook.',
    reversible: false,
  },
  'apply-batch-policy': {
    kind: 'workflow.apply-batch-policy',
    description: 'Applied batch policy to review items.',
    reversible: false,
  },
};

function templateForStep(stepId: string): EffectTemplate {
  return (
    STEP_EFFECTS[stepId] || {
      kind: `workflow.${stepId}`,
      description: `Executed ${stepId}.`,
      reversible: false,
    }
  );
}

export function isStepReversible(stepId: string): boolean {
  return templateForStep(stepId).reversible;
}

export function buildStepEffectSummary(input: {
  effectId: string;
  stepId: string;
  detail: string;
  mode: ExecutionMode;
  stepStatus: 'ok' | 'error';
}): EffectSummary {
  const template = templateForStep(input.stepId);

  return {
    effectId: input.effectId,
    kind: template.kind,
    description: input.detail || template.description,
    reversible: template.reversible,
    status:
      input.stepStatus === 'error'
        ? 'skipped'
        : input.mode === 'live'
          ? 'applied'
          : 'planned',
    metadata: {
      stepId: input.stepId,
      mode: input.mode,
    },
  };
}

export function toRollbackEffectSummaries(
  effectSummaries: EffectSummary[],
): EffectSummary[] {
  return effectSummaries
    .slice()
    .reverse()
    .map(effect => {
      if (!effect.reversible) {
        return {
          ...effect,
          status: 'skipped',
          metadata: {
            ...(effect.metadata || {}),
            rollbackSkipped: 'non-reversible',
          },
        };
      }
      return {
        ...effect,
        status: 'rolled-back',
        metadata: {
          ...(effect.metadata || {}),
          rollbackApplied: true,
        },
      };
    });
}
