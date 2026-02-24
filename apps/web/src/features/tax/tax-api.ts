import { connect } from '../../core/api/surreal-client';
import type { EuerLine, TaxMapping, TaxTransaction, VatRate } from './types';

// ── Tax Mapping CRUD ─────────────────────────────────────────────────────────

export async function listTaxMappings(): Promise<TaxMapping[]> {
  const db = await connect();
  const result = await db.query<TaxMapping[][]>(
    `SELECT *, category.name AS category_name FROM tax_mapping`,
  );
  return result[0] ?? [];
}

export async function upsertTaxMapping(mapping: {
  category: string; // "category:xyz"
  euer_line: EuerLine;
  vat_rate: VatRate;
  is_tax_relevant: boolean;
}): Promise<void> {
  const db = await connect();
  // Use a unique index on category — upsert via UPDATE ... ELSE INSERT
  await db.query(
    `
    IF (SELECT id FROM tax_mapping WHERE category = $category LIMIT 1) THEN {
      UPDATE tax_mapping SET
        euer_line = $euer_line,
        vat_rate = $vat_rate,
        is_tax_relevant = $is_tax_relevant
      WHERE category = $category;
    } ELSE {
      CREATE tax_mapping SET
        category = $category,
        euer_line = $euer_line,
        vat_rate = $vat_rate,
        is_tax_relevant = $is_tax_relevant,
        created_at = time::now();
    } END
    `,
    mapping,
  );
}

// ── Transaction queries for tax year ─────────────────────────────────────────

export type RawTaxTransaction = TaxTransaction & {
  category_id?: string;
  is_income: boolean;
};

export async function fetchTaxTransactions(
  year: number,
): Promise<RawTaxTransaction[]> {
  const db = await connect();
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const result = await db.query<RawTaxTransaction[][]>(
    `
    SELECT
      id,
      date,
      amount,
      payee.name AS payee_name,
      category AS category_id,
      category.name AS category_name,
      category.is_income AS is_income,
      notes
    FROM transaction
    WHERE date >= $startDate AND date <= $endDate
      AND cleared = true
    ORDER BY date ASC
    `,
    { startDate, endDate },
  );

  return result[0] ?? [];
}

// ── Categories with mappings ──────────────────────────────────────────────────

export type CategoryWithMapping = {
  id: string;
  name: string;
  is_income: boolean;
  parent_name?: string;
  mapping?: TaxMapping;
};

export async function fetchCategoriesWithMappings(): Promise<CategoryWithMapping[]> {
  const db = await connect();
  const [categoriesResult, mappingsResult] = await Promise.all([
    db.query<{ id: string; name: string; is_income: boolean; parent?: string }[][]>(
      `SELECT id, name, is_income, parent FROM category ORDER BY name ASC`,
    ),
    db.query<TaxMapping[][]>(
      `SELECT *, category.name AS category_name FROM tax_mapping`,
    ),
  ]);

  const categories = categoriesResult[0] ?? [];
  const mappings = mappingsResult[0] ?? [];
  const mappingByCategoryId = new Map(
    mappings.map(m => [String(m.category), m]),
  );

  return categories.map(cat => ({
    id: String(cat.id),
    name: cat.name,
    is_income: cat.is_income,
    mapping: mappingByCategoryId.get(String(cat.id)),
  }));
}
