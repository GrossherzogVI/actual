import { ollamaChat } from './ollama-client.js';
import type { ClassificationResult } from './types.js';

// ─── Prompt sanitization ────────────────────────────────────────────────────

/**
 * Strips control characters from user-supplied text and enforces a length cap
 * before the text is interpolated into an LLM prompt. This prevents prompt
 * injection via null bytes, escape sequences, or oversized payloads.
 *
 * @param text   - Raw user-supplied string
 * @param maxLen - Maximum retained character count (default 500)
 */
function sanitizeForPrompt(text: string, maxLen: number = 500): string {
  // Remove C0/C1 control characters (0x00–0x1F, 0x7F) but keep printable ASCII and Unicode
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x1F\x7F]/g, '').slice(0, maxLen);
}

// ─── In-memory classification cache by normalized payee ────────────────────

type CacheEntry = {
  result: ClassificationResult;
  cachedAt: number;
};

const classificationCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
/** Maximum number of entries before evicting oldest 200 (LRU-lite via insertion order). */
const MAX_CACHE_SIZE = 1000;

function normalizePayee(payee: string): string {
  return payee.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function getCachedClassification(
  payee: string,
): ClassificationResult | null {
  const key = normalizePayee(payee);
  const entry = classificationCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    classificationCache.delete(key);
    return null;
  }
  return entry.result;
}

function cacheClassification(
  payee: string,
  result: ClassificationResult,
): void {
  const key = normalizePayee(payee);

  // Evict oldest entries when the cache exceeds the size limit.
  // Map preserves insertion order, so the first entries are the oldest.
  if (classificationCache.size >= MAX_CACHE_SIZE) {
    const keysToDelete = [...classificationCache.keys()].slice(0, 200);
    for (const k of keysToDelete) {
      classificationCache.delete(k);
    }
  }

  classificationCache.set(key, { result, cachedAt: Date.now() });
}

export function clearClassificationCache(): void {
  classificationCache.clear();
}

// ─── Types ─────────────────────────────────────────────────────────────────

export type TransactionInput = {
  id: string;
  payee: string;
  amount: number; // cents
  date: string;
  notes?: string;
  account?: string;
  imported_payee?: string;
};

export type CategoryInfo = {
  id: string;
  name: string;
  group_name?: string;
};

type LLMResponse = {
  category_id: string;
  confidence: number;
  reasoning: string;
  rule_suggestion?: {
    payee_pattern: string;
    match_field: 'payee' | 'imported_payee' | 'notes';
    match_op: 'is' | 'contains';
  };
};

export function buildClassificationPrompt(
  transaction: TransactionInput,
  categories: CategoryInfo[],
): { system: string; user: string } {
  const categoryList = categories
    .map(c => {
      const group = c.group_name ? ` (${c.group_name})` : '';
      return `- ${c.id}: ${c.name}${group}`;
    })
    .join('\n');

  const system = `You are a household finance transaction classifier optimized for German bank transactions.
Your task is to assign a category to a transaction based on the payee, amount, date, and notes.

Rules:
- Return ONLY valid JSON, no markdown or extra text.
- The JSON must have this shape: { "category_id": "...", "confidence": 0.0-1.0, "reasoning": "...", "rule_suggestion": { "payee_pattern": "...", "match_field": "payee"|"imported_payee"|"notes", "match_op": "is"|"contains" } }
- rule_suggestion is optional — include it only when the payee clearly identifies a recurring merchant (e.g. "REWE", "DM Drogerie", "Deutsche Bahn").
- confidence > 0.9 means very certain, 0.7-0.9 means likely, < 0.7 means uncertain.
- Consider common German payee names and transaction patterns.
- category_id MUST be one of the IDs from the provided category list.`;

  const amountFormatted = (transaction.amount / 100).toFixed(2);
  const parts = [
    `Payee: ${sanitizeForPrompt(transaction.payee)}`,
    transaction.imported_payee
      ? `Imported Payee: ${sanitizeForPrompt(transaction.imported_payee)}`
      : null,
    `Amount: ${amountFormatted} EUR`,
    `Date: ${transaction.date}`,
    transaction.notes ? `Notes: ${sanitizeForPrompt(transaction.notes)}` : null,
    transaction.account ? `Account: ${transaction.account}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const user = `Classify this transaction:\n\n${parts}\n\nAvailable categories:\n${categoryList}`;

  return { system, user };
}

export async function classifyTransaction(
  transaction: TransactionInput,
  categories: CategoryInfo[],
  existingRules?: string[],
): Promise<ClassificationResult> {
  // Check cache by normalized payee
  const payee = transaction.payee ?? '';
  if (payee) {
    const cached = getCachedClassification(payee);
    if (cached) {
      // Return a copy with the current transaction's ID
      return { ...cached, transactionId: transaction.id };
    }
  }

  const { system, user } = buildClassificationPrompt(transaction, categories);

  let userPrompt = user;
  if (existingRules?.length) {
    userPrompt += `\n\nExisting rules for context:\n${existingRules.map(r => `- ${r}`).join('\n')}`;
  }

  const raw = await ollamaChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.1, format: 'json' },
  );

  let parsed: LLMResponse;
  try {
    parsed = JSON.parse(raw) as LLMResponse;
  } catch {
    return {
      transactionId: transaction.id,
      categoryId: '',
      confidence: 0,
      reasoning: 'Invalid LLM JSON response',
    };
  }

  // Validate that the returned category_id is one we actually provided
  const validCategoryIds = new Set(categories.map(c => c.id));
  if (parsed.category_id && !validCategoryIds.has(parsed.category_id)) {
    // Hallucinated category: zero confidence so it goes to review queue
    parsed.confidence = 0;
    parsed.reasoning =
      (parsed.reasoning ?? '') + ' [category_id not in valid set]';
  }

  const result: ClassificationResult = {
    transactionId: transaction.id,
    categoryId: parsed.category_id,
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
    reasoning: parsed.reasoning || '',
  };

  if (parsed.rule_suggestion) {
    result.ruleSuggestion = {
      payeePattern: parsed.rule_suggestion.payee_pattern,
      matchField: parsed.rule_suggestion.match_field,
      matchOp: parsed.rule_suggestion.match_op,
    };
  }

  // Cache by payee for subsequent transactions with the same payee
  if (payee) {
    cacheClassification(payee, result);
  }

  return result;
}

const CONCURRENCY_LIMIT = 3;

export async function classifyBatch(
  transactions: TransactionInput[],
  categories: CategoryInfo[],
): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = [];
  const queue = [...transactions];

  async function worker() {
    while (queue.length > 0) {
      const tx = queue.shift()!;
      try {
        const result = await classifyTransaction(tx, categories);
        results.push(result);
      } catch {
        results.push({
          transactionId: tx.id,
          categoryId: '',
          confidence: 0,
          reasoning: 'Classification failed',
        });
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY_LIMIT, transactions.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return results;
}
