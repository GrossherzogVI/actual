import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Ollama client
const mockOllamaGenerate = vi.fn();
const mockIsOllamaEnabled = vi.fn();

vi.mock('../ai/ollama-client.js', () => ({
  ollamaGenerate: (...args: unknown[]) => mockOllamaGenerate(...args),
  isOllamaEnabled: () => mockIsOllamaEnabled(),
}));

import { parseNaturalLanguageQuery } from './nl-query.js';

describe('parseNaturalLanguageQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('with Ollama enabled', () => {
    it('parses a spending query via Ollama', async () => {
      mockIsOllamaEnabled.mockReturnValue(true);
      mockOllamaGenerate.mockResolvedValue(
        JSON.stringify({
          type: 'spending',
          params: { category: 'groceries', period: 'month' },
        }),
      );

      const result = await parseNaturalLanguageQuery(
        'How much did I spend on groceries this month?',
        'file-1',
      );

      expect(result.type).toBe('spending');
      expect(result.params.category).toBe('groceries');
      expect(mockOllamaGenerate).toHaveBeenCalledTimes(1);
    });

    it('parses a contracts query via Ollama', async () => {
      mockIsOllamaEnabled.mockReturnValue(true);
      mockOllamaGenerate.mockResolvedValue(
        JSON.stringify({
          type: 'contracts',
          params: { status: 'active' },
        }),
      );

      const result = await parseNaturalLanguageQuery(
        'Show me all active contracts',
        'file-1',
      );

      expect(result.type).toBe('contracts');
      expect(result.params.status).toBe('active');
    });

    it('falls back to keyword parsing on invalid Ollama response', async () => {
      mockIsOllamaEnabled.mockReturnValue(true);
      mockOllamaGenerate.mockResolvedValue('not valid json at all');

      const result = await parseNaturalLanguageQuery(
        'What is my forecast?',
        'file-1',
      );

      expect(result.type).toBe('forecast');
      expect(result.params).toEqual({});
    });

    it('falls back on Ollama error', async () => {
      mockIsOllamaEnabled.mockReturnValue(true);
      mockOllamaGenerate.mockRejectedValue(new Error('Connection refused'));

      const result = await parseNaturalLanguageQuery(
        'Show my subscriptions',
        'file-1',
      );

      expect(result.type).toBe('contracts');
    });

    it('falls back when Ollama returns invalid query type', async () => {
      mockIsOllamaEnabled.mockReturnValue(true);
      mockOllamaGenerate.mockResolvedValue(
        JSON.stringify({ type: 'invalid-type', params: {} }),
      );

      const result = await parseNaturalLanguageQuery(
        'What is my balance right now?',
        'file-1',
      );

      expect(result.type).toBe('balance');
    });
  });

  describe('fallback keyword parsing (Ollama disabled)', () => {
    beforeEach(() => {
      mockIsOllamaEnabled.mockReturnValue(false);
    });

    it('detects forecast queries', async () => {
      const result = await parseNaturalLanguageQuery('Show me my forecast', 'f1');
      expect(result.type).toBe('forecast');
    });

    it('detects projection queries', async () => {
      const result = await parseNaturalLanguageQuery(
        'What does the projection look like?',
        'f1',
      );
      expect(result.type).toBe('forecast');
    });

    it('detects contract queries', async () => {
      const result = await parseNaturalLanguageQuery(
        'List my contracts',
        'f1',
      );
      expect(result.type).toBe('contracts');
    });

    it('detects subscription queries', async () => {
      const result = await parseNaturalLanguageQuery(
        'What subscriptions do I pay for?',
        'f1',
      );
      expect(result.type).toBe('contracts');
    });

    it('detects balance queries', async () => {
      const result = await parseNaturalLanguageQuery(
        'What is my current balance?',
        'f1',
      );
      expect(result.type).toBe('balance');
    });

    it('detects comparison queries', async () => {
      const result = await parseNaturalLanguageQuery(
        'Compare groceries vs eating out',
        'f1',
      );
      expect(result.type).toBe('comparison');
    });

    it('defaults to spending for unrecognized queries', async () => {
      const result = await parseNaturalLanguageQuery(
        'Tell me about my money',
        'f1',
      );
      expect(result.type).toBe('spending');
    });
  });
});
