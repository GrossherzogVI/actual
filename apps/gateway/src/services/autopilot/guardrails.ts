import type { CommandParseError, CommandParseStep } from '@finance-os/domain-kernel';

import type {
  ExecutionMode,
  GuardrailProfile,
  GuardrailResult,
  OpsState,
} from '../../types';

const SENSITIVE_DELEGATE_STEPS = new Set([
  'run-close-weekly',
  'run-close-monthly',
  'run-close-safe',
  'create-default-playbook',
  'apply-batch-policy',
]);

export type GuardrailEvaluationInput = {
  opsState: OpsState;
  actorId: string;
  steps: CommandParseStep[];
  parseErrors: CommandParseError[];
  profile: GuardrailProfile;
  mode: ExecutionMode;
  rollbackRequired: boolean;
  nonReversibleStepIds: Set<string>;
  urgentReviewsThreshold?: number;
};

export type GuardrailEvaluationResult = {
  results: GuardrailResult[];
  hasBlockingFailure: boolean;
};

function toRule(
  input: {
    ruleId: string;
    passed: boolean;
    message: string;
    severity: GuardrailResult['severity'];
    blocking: boolean;
  },
): GuardrailResult {
  return {
    ruleId: input.ruleId,
    passed: input.passed,
    message: input.message,
    severity: input.severity,
    blocking: input.blocking,
  };
}

function applyProfile(
  profile: GuardrailProfile,
  rule: GuardrailResult,
  allowDowngrade: boolean,
): GuardrailResult {
  if (profile === 'off') {
    return {
      ...rule,
      blocking: false,
      severity: rule.passed ? 'info' : 'warn',
    };
  }

  if (profile === 'balanced' && allowDowngrade && !rule.passed) {
    return {
      ...rule,
      blocking: false,
      severity: 'warn',
    };
  }

  return rule;
}

export function evaluateGuardrails(
  input: GuardrailEvaluationInput,
): GuardrailEvaluationResult {
  const urgentThreshold =
    typeof input.urgentReviewsThreshold === 'number'
      ? Math.max(1, Math.trunc(input.urgentReviewsThreshold))
      : 5;

  const hasDelegateSensitiveStep =
    input.actorId === 'delegate' &&
    input.steps.some(step => SENSITIVE_DELEGATE_STEPS.has(step.id));
  const hasParseErrors = input.parseErrors.length > 0;
  const hasNonReversibleRollbackSteps =
    input.rollbackRequired &&
    input.steps.some(step => input.nonReversibleStepIds.has(step.id));

  const baseRules: Array<{ rule: GuardrailResult; allowDowngrade: boolean }> = [
    {
      rule: toRule({
        ruleId: 'urgent-review-threshold',
        passed: input.opsState.urgentReviews <= urgentThreshold,
        message:
          input.opsState.urgentReviews <= urgentThreshold
            ? `Urgent review pressure (${input.opsState.urgentReviews}) is within threshold (${urgentThreshold}).`
            : `Urgent reviews (${input.opsState.urgentReviews}) exceed threshold (${urgentThreshold}).`,
        severity: input.opsState.urgentReviews <= urgentThreshold ? 'info' : 'critical',
        blocking: input.opsState.urgentReviews > urgentThreshold,
      }),
      allowDowngrade: true,
    },
    {
      rule: toRule({
        ruleId: 'delegate-sensitive-steps',
        passed: !hasDelegateSensitiveStep,
        message: hasDelegateSensitiveStep
          ? 'Delegate actor attempted sensitive financial step(s).'
          : 'No delegate-sensitive step violations detected.',
        severity: hasDelegateSensitiveStep ? 'critical' : 'info',
        blocking: hasDelegateSensitiveStep,
      }),
      allowDowngrade: true,
    },
    {
      rule: toRule({
        ruleId: 'command-parse-errors',
        passed: !hasParseErrors,
        message: hasParseErrors
          ? `Command parse errors detected (${input.parseErrors.length}).`
          : 'No command parse errors detected.',
        severity: hasParseErrors ? 'critical' : 'info',
        blocking: hasParseErrors,
      }),
      allowDowngrade: false,
    },
    {
      rule: toRule({
        ruleId: 'rollback-reversibility',
        passed: !hasNonReversibleRollbackSteps,
        message: hasNonReversibleRollbackSteps
          ? 'Rollback required but one or more steps are non-reversible.'
          : 'Rollback policy is compatible with step reversibility.',
        severity: hasNonReversibleRollbackSteps ? 'critical' : 'info',
        blocking: hasNonReversibleRollbackSteps,
      }),
      allowDowngrade: false,
    },
  ];

  const results = baseRules.map(item =>
    applyProfile(input.profile, item.rule, item.allowDowngrade),
  );

  const hasBlockingFailure = results.some(result => !result.passed && result.blocking);
  const modeAdjustedResults =
    input.mode === 'dry-run'
      ? results.map(result =>
          result.blocking && !result.passed
            ? {
                ...result,
                message: `[dry-run advisory] ${result.message}`,
              }
            : result,
        )
      : results;

  return {
    results: modeAdjustedResults,
    hasBlockingFailure,
  };
}
