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

// Normalize German decimal input: ',' is decimal separator, '.' is thousand separator.
// Examples: "12,50" -> "12.50", "1.250,00" -> "1250.00", "12.50+8.30" -> "12.50+8.30"
function normalizeDecimalInput(input: string): string {
  // Process each number-like segment individually (split on operators/parens/spaces)
  return input.replace(/[\d.,]+/g, match => {
    const hasComma = match.includes(',');
    const hasDot = match.includes('.');

    if (hasComma && hasDot) {
      // Both present: last separator is decimal, earlier ones are thousands
      const lastComma = match.lastIndexOf(',');
      const lastDot = match.lastIndexOf('.');
      if (lastComma > lastDot) {
        // German: 1.250,00 -> 1250.00
        return match.replace(/\./g, '').replace(',', '.');
      } else {
        // English: 1,250.00 -> 1250.00
        return match.replace(/,/g, '');
      }
    } else if (hasComma) {
      // Only commas: last comma is the decimal separator (12,50 -> 12.50; 1,000,00 -> 100000 then .00)
      // Strip all but the last comma (treat earlier ones as thousand seps), convert last to dot
      const lastCommaIdx = match.lastIndexOf(',');
      const stripped = match.slice(0, lastCommaIdx).replace(/,/g, '') + '.' + match.slice(lastCommaIdx + 1);
      return stripped;
    }
    // Only dots or neither: leave as-is (already valid)
    return match;
  });
}

export function useCalculator() {
  const evaluate = useCallback((expression: string): number | null => {
    if (!expression.trim()) return null;
    // Normalize German decimal separators before sanitizing
    const normalized = normalizeDecimalInput(expression);
    // Only allow numbers, +, -, *, /, (, ), ., spaces
    const sanitized = normalized.replace(/[^0-9+\-*/.() ]/g, '');
    if (!sanitized.trim()) return null;

    const result = parseMath(sanitized);
    if (result !== null && isFinite(result)) {
      return Math.round(result * 100); // convert to cents
    }

    return null;
  }, []);

  return { evaluate };
}
