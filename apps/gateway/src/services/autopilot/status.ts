import type { EffectSummary, RunStatus } from '../../types';

const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set([
  'completed',
  'failed',
  'blocked',
  'rolled_back',
]);

const ROLLBACK_SOURCE_STATUSES: ReadonlySet<RunStatus> = new Set([
  'completed',
  'failed',
]);

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isRollbackSourceStatus(status: RunStatus): boolean {
  return ROLLBACK_SOURCE_STATUSES.has(status);
}

export function computeRollbackWindowUntil(
  startedAtMs: number,
  rollbackWindowMinutes: number,
): number {
  return startedAtMs + rollbackWindowMinutes * 60_000;
}

export function isRollbackEligibleByEffects(effects: EffectSummary[]): boolean {
  if (effects.length === 0) {
    return false;
  }
  return effects.every(effect => effect.reversible);
}
