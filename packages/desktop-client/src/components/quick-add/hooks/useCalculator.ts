// @ts-strict-ignore
import { useCallback } from 'react';

export function useCalculator() {
  const evaluate = useCallback((expression: string): number | null => {
    if (!expression.trim()) return null;
    // Only allow numbers, +, -, *, /, (, ), ., spaces
    const sanitized = expression.replace(/[^0-9+\-*/.() ]/g, '');
    if (!sanitized.trim()) return null;
    try {
      // Safe eval using Function constructor
      const result = new Function(`return (${sanitized})`)();
      if (typeof result === 'number' && isFinite(result)) {
        return Math.round(result * 100); // convert to cents
      }
    } catch {
      return null;
    }
    return null;
  }, []);

  return { evaluate };
}
