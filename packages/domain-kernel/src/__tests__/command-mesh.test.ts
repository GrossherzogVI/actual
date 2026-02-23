import { describe, expect, it } from 'vitest';

import { parseCommandChain } from '../command-mesh';

describe('parseCommandChain', () => {
  it('parses canonical command chain tokens', () => {
    const parsed = parseCommandChain('triage -> close-weekly');

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.steps.map(step => step.id)).toEqual([
      'resolve-next-action',
      'run-close-weekly',
    ]);
  });

  it('merges two-token close form into one command step', () => {
    const parsed = parseCommandChain('close -> weekly');

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0]?.id).toBe('run-close-weekly');
    expect(parsed.steps[0]?.raw).toBe('close -> weekly');
  });

  it('merges triage -> resolve-next into one action', () => {
    const parsed = parseCommandChain('triage -> resolve-next');

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0]?.id).toBe('resolve-next-action');
  });

  it('parses playbook chain with pair + single aliases', () => {
    const parsed = parseCommandChain('playbook -> create-default -> run-first');

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.steps.map(step => step.id)).toEqual([
      'create-default-playbook',
      'run-first-playbook',
    ]);
  });

  it('returns unknown token errors with positional index', () => {
    const parsed = parseCommandChain('triage -> unknown-step');

    expect(parsed.steps.map(step => step.id)).toEqual(['resolve-next-action']);
    expect(parsed.errors).toEqual([
      {
        code: 'unknown-token',
        index: 1,
        raw: 'unknown-step',
      },
    ]);
  });

  it('returns a deterministic error for empty chains', () => {
    const parsed = parseCommandChain('   ');

    expect(parsed.steps).toHaveLength(0);
    expect(parsed.errors).toEqual([
      {
        code: 'empty-command',
        index: -1,
        raw: '',
      },
    ]);
  });
});
