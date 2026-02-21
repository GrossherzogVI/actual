import { isOllamaEnabled, ollamaGenerate } from '../ai/ollama-client.js';

export type StructuredQueryType =
  | 'spending'
  | 'balance'
  | 'forecast'
  | 'contracts'
  | 'comparison';

export type StructuredQuery = {
  type: StructuredQueryType;
  params: Record<string, unknown>;
};

const PARSE_PROMPT = `You are a financial query parser. Given a natural language question about personal finances, extract a structured query.

Return JSON with:
- "type": one of "spending", "balance", "forecast", "contracts", "comparison"
- "params": an object with relevant parameters

Parameter guidelines by type:
- spending: { category?, payee?, startDate?, endDate?, period? }
- balance: { accountId?, date? }
- forecast: { horizon?, startingBalance? }
- contracts: { status?, type?, expiringWithin? }
- comparison: { categoryA?, categoryB?, period? }

Dates should be in YYYY-MM-DD format. Period can be "week", "month", "quarter", "year".
If information is not specified, omit that parameter.

Respond ONLY with valid JSON, no additional text.

Question: `;

/**
 * Parse a natural language question into a structured query using Ollama.
 * Falls back to keyword-based parsing if Ollama is not available.
 */
export async function parseNaturalLanguageQuery(
  question: string,
  _fileId: string,
): Promise<StructuredQuery> {
  if (!isOllamaEnabled()) {
    return fallbackParse(question);
  }

  try {
    const response = await ollamaGenerate(PARSE_PROMPT + question, {
      temperature: 0.1,
      format: 'json',
    });

    const parsed = JSON.parse(response);
    if (!parsed.type || !isValidQueryType(parsed.type)) {
      return fallbackParse(question);
    }

    return {
      type: parsed.type,
      params: parsed.params || {},
    };
  } catch {
    return fallbackParse(question);
  }
}

function isValidQueryType(type: string): type is StructuredQueryType {
  return ['spending', 'balance', 'forecast', 'contracts', 'comparison'].includes(
    type,
  );
}

/**
 * Simple keyword-based fallback when Ollama is unavailable.
 */
function fallbackParse(question: string): StructuredQuery {
  const q = question.toLowerCase();

  if (q.includes('forecast') || q.includes('projection') || q.includes('predict')) {
    return { type: 'forecast', params: {} };
  }
  if (q.includes('contract') || q.includes('subscription')) {
    return { type: 'contracts', params: {} };
  }
  if (q.includes('balance') || q.includes('how much do i have')) {
    return { type: 'balance', params: {} };
  }
  if (q.includes('compare') || q.includes('vs') || q.includes('versus')) {
    return { type: 'comparison', params: {} };
  }

  // Default to spending query
  return { type: 'spending', params: {} };
}
