import type { ClassificationResult } from './types.js';

import { ollamaChat } from './ollama-client.js';

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
    `Payee: ${transaction.payee}`,
    transaction.imported_payee
      ? `Imported Payee: ${transaction.imported_payee}`
      : null,
    `Amount: ${amountFormatted} EUR`,
    `Date: ${transaction.date}`,
    transaction.notes ? `Notes: ${transaction.notes}` : null,
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
  const { system, user } = buildClassificationPrompt(
    transaction,
    categories,
  );

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

  const parsed = JSON.parse(raw) as LLMResponse;

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

  return result;
}

const CONCURRENCY_LIMIT = 3;

export async function classifyBatch(
  transactions: TransactionInput[],
  categories: CategoryInfo[],
  _fileId: string,
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
