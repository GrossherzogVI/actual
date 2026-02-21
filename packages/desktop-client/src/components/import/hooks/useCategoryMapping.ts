// @ts-strict-ignore
import { useCallback, useEffect, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import type { CategoryMapping, CategoryTemplate } from '../types';

type UseCategoryMappingOptions = {
  externalCategories: string[];
};

type UseCategoryMappingReturn = {
  templates: CategoryTemplate[];
  mappings: CategoryMapping[];
  matchedCount: number;
  loading: boolean;
  updateMapping: (external: string, internalId: string | null) => void;
  autoMatch: () => void;
  getMappingRecord: () => Record<string, string>;
};

/** Naive fuzzy match: strip special chars, compare lowercase substrings. */
function fuzzyScore(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]/g, ' ')
      .trim();
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const wordsA = na.split(/\s+/);
  const wordsB = nb.split(/\s+/);
  const shared = wordsA.filter(w => w.length > 2 && wordsB.includes(w));
  if (shared.length === 0) return 0;
  return shared.length / Math.max(wordsA.length, wordsB.length);
}

export function useCategoryMapping({
  externalCategories,
}: UseCategoryMappingOptions): UseCategoryMappingReturn {
  const [templates, setTemplates] = useState<CategoryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [mappings, setMappings] = useState<CategoryMapping[]>([]);

  useEffect(() => {
    async function load() {
      const res = await (send as Function)('categories-setup-templates', {});
      if (res && !('error' in res)) {
        setTemplates((res as CategoryTemplate[]) ?? []);
      }
      setLoading(false);
    }
    void load();
  }, []);

  // Initialize mappings when external categories change
  useEffect(() => {
    setMappings(
      externalCategories.map(ext => ({
        external: ext,
        internal_id: null,
        auto_matched: false,
      })),
    );
  }, [externalCategories]);

  const autoMatch = useCallback(() => {
    // We'll try to auto-match against actual budget categories via a fuzzy search.
    // Since we don't have internal category list here, we use template names as hints.
    // Real auto-match would need the category list from actual; this is best-effort.
    setMappings(prev =>
      prev.map(m => {
        if (m.internal_id) return m; // already mapped
        let bestScore = 0;
        let bestId: string | null = null;
        for (const template of templates) {
          const score = fuzzyScore(m.external, template.name);
          if (score > bestScore && score >= 0.5) {
            bestScore = score;
            bestId = template.id;
          }
        }
        return { ...m, internal_id: bestId, auto_matched: bestId !== null };
      }),
    );
  }, [templates]);

  const updateMapping = useCallback((external: string, internalId: string | null) => {
    setMappings(prev =>
      prev.map(m =>
        m.external === external
          ? { ...m, internal_id: internalId, auto_matched: false }
          : m,
      ),
    );
  }, []);

  const getMappingRecord = useCallback((): Record<string, string> => {
    const record: Record<string, string> = {};
    for (const m of mappings) {
      if (m.internal_id) {
        record[m.external] = m.internal_id;
      }
    }
    return record;
  }, [mappings]);

  const matchedCount = mappings.filter(m => m.internal_id !== null).length;

  return {
    templates,
    mappings,
    matchedCount,
    loading,
    updateMapping,
    autoMatch,
    getMappingRecord,
  };
}
