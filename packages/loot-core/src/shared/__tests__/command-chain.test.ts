import { describe, expect, it } from 'vitest';

import {
  parseChain,
  resolveStepHandler,
  validateChain,
} from '../command-chain';

describe('command-chain', () => {
  describe('parseChain', () => {
    it('parses a single command', () => {
      const steps = parseChain('close weekly');
      expect(steps).toHaveLength(1);
      expect(steps[0].command).toBe('close');
      expect(steps[0].args).toEqual(['weekly']);
    });

    it('parses a multi-step chain', () => {
      const steps = parseChain('accept all -> close weekly -> focus');
      expect(steps).toHaveLength(3);
      expect(steps[0].command).toBe('accept');
      expect(steps[0].args).toEqual(['all']);
      expect(steps[1].command).toBe('close');
      expect(steps[1].args).toEqual(['weekly']);
      expect(steps[2].command).toBe('focus');
      expect(steps[2].args).toEqual([]);
    });

    it('trims whitespace around steps', () => {
      const steps = parseChain('  close weekly  ->  focus  ');
      expect(steps).toHaveLength(2);
      expect(steps[0].raw).toBe('close weekly');
      expect(steps[1].raw).toBe('focus');
    });

    it('skips empty steps', () => {
      const steps = parseChain('close weekly -> -> focus');
      expect(steps).toHaveLength(2);
    });

    it('generates sequential step IDs', () => {
      const steps = parseChain('a -> b -> c');
      expect(steps.map(s => s.id)).toEqual(['step-0', 'step-1', 'step-2']);
    });
  });

  describe('validateChain', () => {
    it('validates a correct chain', () => {
      const result = validateChain('close weekly -> accept all');
      expect(result.success).toBe(true);
      expect(result.errorCount).toBe(0);
    });

    it('catches unknown commands', () => {
      const result = validateChain('foo -> close weekly');
      expect(result.success).toBe(false);
      expect(result.errorCount).toBe(1);
      expect(result.steps[0].status).toBe('error');
      expect(result.steps[0].detail).toContain('Unknown command');
    });

    it('validates close requires period', () => {
      const result = validateChain('close');
      expect(result.success).toBe(false);
      expect(result.steps[0].detail).toContain('weekly');
    });

    it('validates snooze requires days', () => {
      const result = validateChain('snooze');
      expect(result.success).toBe(false);
      expect(result.steps[0].detail).toContain('positive number');
    });

    it('validates snooze rejects non-numeric', () => {
      const result = validateChain('snooze abc');
      expect(result.success).toBe(false);
    });

    it('validates tag requires name', () => {
      const result = validateChain('tag');
      expect(result.success).toBe(false);
      expect(result.steps[0].detail).toContain('tag name');
    });

    it('validates a full operational chain', () => {
      const result = validateChain(
        'accept high-confidence -> classify -> snooze 7 -> close monthly -> focus',
      );
      expect(result.success).toBe(true);
      expect(result.errorCount).toBe(0);
      expect(result.steps).toHaveLength(5);
    });
  });

  describe('resolveStepHandler', () => {
    it('resolves close to workflow handler', () => {
      const steps = parseChain('close weekly');
      const resolved = resolveStepHandler(steps[0]);
      expect(resolved).toEqual({
        handler: 'workflow-run-close-routine',
        args: { period: 'weekly' },
      });
    });

    it('resolves accept to review-batch handler', () => {
      const steps = parseChain('accept high-confidence');
      const resolved = resolveStepHandler(steps[0]);
      expect(resolved).toEqual({
        handler: 'review-batch',
        args: { status: 'accepted', filter: 'high-confidence' },
      });
    });

    it('resolves snooze with days', () => {
      const steps = parseChain('snooze 14');
      const resolved = resolveStepHandler(steps[0]);
      expect(resolved).toEqual({
        handler: 'review-batch',
        args: { status: 'snoozed', days: 14 },
      });
    });

    it('returns null for unknown commands', () => {
      const steps = parseChain('unknown_cmd');
      const resolved = resolveStepHandler(steps[0]);
      expect(resolved).toBeNull();
    });
  });
});
