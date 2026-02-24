import type { JobHandler } from '../types';

import { handleImportCsv } from './import-csv';

/**
 * Handler registry — maps job names to handler functions.
 * main.ts imports this and dispatches jobs via lookup.
 */
export const handlers: Record<string, JobHandler> = {
  'import-csv': handleImportCsv,
};
