import express from 'express';

import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '../util/middlewares.js';

import {
  DEFAULT_TAGS,
  FINANZGURU_CATEGORY_MAP,
  GERMAN_CATEGORY_TREE,
} from './german-tree.js';

const app = express();

export { app as handlers };
app.use(express.json());
app.use(requestLoggerMiddleware);
app.use(validateSessionMiddleware);

/**
 * Categories Setup Router — /categories-setup
 *
 * Note: This router does NOT write to account.sqlite.
 * Category seeding writes to loot-core's db.sqlite via the loot-core handler bridge.
 * These endpoints return the data/structure needed — the actual DB writes happen
 * client-side through loot-core handlers.
 */

/** POST /categories-setup/german-tree — return German tree for client-side seeding */
app.post('/german-tree', (_req, res) => {
  // Return the full German category tree structure.
  // The client will create these categories via loot-core handlers
  // (send('api/create-category-group', ...) and send('api/create-category', ...))
  res.json({
    status: 'ok',
    data: {
      groups: GERMAN_CATEGORY_TREE,
      default_tags: DEFAULT_TAGS,
      total_groups: GERMAN_CATEGORY_TREE.length,
      total_categories: GERMAN_CATEGORY_TREE.reduce(
        (sum, g) => sum + g.categories.length,
        0,
      ),
    },
  });
});

/** GET /categories-setup/templates — available category templates */
app.get('/templates', (_req, res) => {
  const templates = [
    {
      id: 'german-standard',
      name: 'Deutsche Standard-Kategorien',
      description:
        '12 Gruppen, ~70 Kategorien — optimiert für deutsche Haushalte',
      groups: GERMAN_CATEGORY_TREE.length,
      categories: GERMAN_CATEGORY_TREE.reduce(
        (sum, g) => sum + g.categories.length,
        0,
      ),
      is_income_included: true,
    },
    {
      id: 'finanzguru-mapping',
      name: 'Finanzguru-Mapping',
      description: 'Mappt Finanzguru-Kategorien auf interne Kategorien',
      groups: 0,
      categories: Object.keys(FINANZGURU_CATEGORY_MAP).length,
      is_income_included: false,
    },
  ];

  res.json({ status: 'ok', data: templates });
});

/** POST /categories-setup/map — map external categories to internal */
app.post('/map', (req, res) => {
  const { external_categories, source } = req.body ?? {};

  if (!Array.isArray(external_categories)) {
    res.status(400).json({ status: 'error', reason: 'external-categories-required' });
    return;
  }

  const map =
    source === 'finanzguru' ? FINANZGURU_CATEGORY_MAP : FINANZGURU_CATEGORY_MAP;

  const result: Array<{
    external: string;
    mapped_group: string | null;
    mapped_category: string | null;
    confidence: 'exact' | 'fuzzy' | 'none';
  }> = [];

  for (const ext of external_categories) {
    const extName = String(ext).trim();

    // Exact match
    if (map[extName]) {
      result.push({
        external: extName,
        mapped_group: map[extName].group,
        mapped_category: map[extName].category,
        confidence: 'exact',
      });
      continue;
    }

    // Fuzzy match: check if any key contains the external name
    const fuzzyKey = Object.keys(map).find(
      k =>
        k.toLowerCase().includes(extName.toLowerCase()) ||
        extName.toLowerCase().includes(k.toLowerCase()),
    );

    if (fuzzyKey) {
      result.push({
        external: extName,
        mapped_group: map[fuzzyKey].group,
        mapped_category: map[fuzzyKey].category,
        confidence: 'fuzzy',
      });
      continue;
    }

    result.push({
      external: extName,
      mapped_group: null,
      mapped_category: null,
      confidence: 'none',
    });
  }

  res.json({ status: 'ok', data: result });
});
