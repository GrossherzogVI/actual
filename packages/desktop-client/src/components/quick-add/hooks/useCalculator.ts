// @ts-strict-ignore
import { useCallback } from 'react';

function parseMath(str: string): number | null {
  try {
    const tokens = str.match(/(?:\d+\.\d+|\d+|\+|-|\*|\/|\(|\))/g);
    if (!tokens) return null;

    let pos = 0;

    function parseExpression(): number {
      let left = parseTerm();
      while (pos < tokens!.length) {
        const op = tokens![pos];
        if (op === '+' || op === '-') {
          pos++;
          const right = parseTerm();
          left = op === '+' ? left + right : left - right;
        } else {
          break;
        }
      }
      return left;
    }

    function parseTerm(): number {
      let left = parseFactor();
      while (pos < tokens!.length) {
        const op = tokens![pos];
        if (op === '*' || op === '/') {
          pos++;
          const right = parseFactor();
          left = op === '*' ? left * right : left / right;
        } else {
          break;
        }
      }
      return left;
    }

    function parseFactor(): number {
      if (pos >= tokens!.length) throw new Error('Unexpected end');
      const token = tokens![pos++];
      if (token === '(') {
        const val = parseExpression();
        if (pos >= tokens!.length || tokens![pos++] !== ')') {
          throw new Error('Missing closing parenthesis');
        }
        return val;
      }
      if (token === '-' || token === '+') {
        const val = parseFactor();
        return token === '-' ? -val : val;
      }
      const num = parseFloat(token);
      if (isNaN(num)) throw new Error('Invalid number');
      return num;
    }

    const result = parseExpression();
    if (pos < tokens.length) throw new Error('Extra tokens');
    return result;
  } catch (err) {
    return null;
  }
}

export function useCalculator() {
  const evaluate = useCallback((expression: string): number | null => {
    if (!expression.trim()) return null;
    // Only allow numbers, +, -, *, /, (, ), ., spaces
    const sanitized = expression.replace(/[^0-9+\-*/.() ]/g, '');
    if (!sanitized.trim()) return null;

    const result = parseMath(sanitized);
    if (result !== null && isFinite(result)) {
      return Math.round(result * 100); // convert to cents
    }

    return null;
  }, []);

  return { evaluate };
}
