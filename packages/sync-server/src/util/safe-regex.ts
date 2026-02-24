/**
 * ReDoS protection utilities.
 *
 * Validates user-supplied regex patterns before they are compiled and executed,
 * guarding against catastrophic backtracking (ReDoS) attacks.
 */

/** Maximum allowed pattern length for user-supplied regexes. */
const DEFAULT_MAX_LENGTH = 100;

/**
 * Patterns that indicate nested quantifiers — a primary vector for ReDoS.
 * Examples: (a+)+  (.+)*  ([a-z]*)+
 */
const NESTED_QUANTIFIER_RE =
  /\([^)]*[+*][^)]*\)[+*?]|\([^)]*\)[+*]\{|\([^)]*\)\+[+*]|\[[^\]]*\][+*][+*]/;

/**
 * Detect overlapping alternation groups that can cause exponential backtracking.
 * Example: (a|a)+  (a|ab)+
 */
const ALTERNATION_QUANTIFIER_RE = /\([^)]*\|[^)]*\)[+*]/;

/**
 * Returns `true` if the given regex pattern is considered safe to compile and run.
 *
 * Safety criteria:
 * - Length does not exceed `maxLength` characters
 * - Does not contain nested quantifiers (e.g. `(a+)+`, `(.+)*`, `([a-z]+)+`)
 * - Does not contain alternation groups followed by a quantifier (e.g. `(a|b)+`)
 * - Compiles without error (syntactically valid)
 *
 * @param pattern   - The raw regex pattern string (without delimiters or flags)
 * @param maxLength - Maximum allowed pattern length (default 100)
 */
export function isSafeRegex(
  pattern: string,
  maxLength: number = DEFAULT_MAX_LENGTH,
): boolean {
  if (typeof pattern !== 'string') return false;
  if (pattern.length > maxLength) return false;
  if (NESTED_QUANTIFIER_RE.test(pattern)) return false;
  if (ALTERNATION_QUANTIFIER_RE.test(pattern)) return false;

  // Ensure the pattern is syntactically valid
  try {
    new RegExp(pattern);
  } catch {
    return false;
  }

  return true;
}
