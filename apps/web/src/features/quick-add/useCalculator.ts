import { useMemo } from 'react';

/**
 * Evaluates a simple arithmetic expression (supports +, -).
 * Returns 0 for empty or invalid input.
 */
function evaluate(expression: string): number {
  const trimmed = expression.trim();
  if (!trimmed) return 0;

  // Only allow digits, decimal separators, +, -, spaces
  if (!/^[\d.,+\-\s]+$/.test(trimmed)) return 0;

  // Normalize: replace German comma with dot
  const normalized = trimmed.replace(/,/g, '.');

  // Split by + and - while keeping the operator
  const tokens = normalized.match(/[+-]?[^+-]+/g);
  if (!tokens) return 0;

  let total = 0;
  for (const token of tokens) {
    const value = parseFloat(token.trim());
    if (Number.isNaN(value)) return 0;
    total += value;
  }

  // Round to 2 decimal places to avoid floating point artifacts
  return Math.round(total * 100) / 100;
}

export function useCalculator(expression: string) {
  const result = useMemo(() => evaluate(expression), [expression]);
  return result;
}
