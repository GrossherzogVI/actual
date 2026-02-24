-- ── Tax Export Schema ────────────────────────────────────────────────────────
-- Stores per-category mappings to EÜR line items and VAT rates.
-- Used by the Tax Export module (EÜR + Umsatzsteuer-Voranmeldung).

DEFINE TABLE tax_mapping SCHEMAFULL;

-- Link to the finance category
DEFINE FIELD category     ON tax_mapping TYPE record<category>;

-- EÜR line item identifier (matches EuerLine union in types.ts)
-- e.g. "umsatzerloese", "miete_nebenkosten", "sonstige_ausgaben", "nicht_relevant"
DEFINE FIELD euer_line    ON tax_mapping TYPE string;

-- VAT rate applied to transactions in this category: 0, 7, or 19
DEFINE FIELD vat_rate     ON tax_mapping TYPE number
  ASSERT $value IN [0, 7, 19];

-- Whether transactions in this category are included in tax calculations
DEFINE FIELD is_tax_relevant ON tax_mapping TYPE bool DEFAULT false;

DEFINE FIELD created_at   ON tax_mapping TYPE datetime DEFAULT time::now();

-- Enforce one mapping per category
DEFINE INDEX idx_tax_mapping_category ON tax_mapping FIELDS category UNIQUE;
