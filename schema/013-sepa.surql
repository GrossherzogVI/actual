-- Finance OS — SEPA Payment Batches
-- pain.001.003.03 SEPA Credit Transfer support

-- ─── SEPA Batch ──────────────────────────────────────────────────────────────

DEFINE TABLE sepa_batch SCHEMAFULL;
DEFINE FIELD name         ON sepa_batch TYPE string;
DEFINE FIELD total_amount ON sepa_batch TYPE decimal;
DEFINE FIELD payment_count ON sepa_batch TYPE int;
DEFINE FIELD xml_data     ON sepa_batch TYPE option<string>;
DEFINE FIELD status       ON sepa_batch TYPE string
  DEFAULT 'draft'
  ASSERT $value IN ['draft', 'exported', 'confirmed'];
DEFINE FIELD created_at   ON sepa_batch TYPE datetime DEFAULT time::now();

-- ─── SEPA Payment ────────────────────────────────────────────────────────────

DEFINE TABLE sepa_payment SCHEMAFULL;
DEFINE FIELD contract     ON sepa_payment TYPE option<record<contract>>;
DEFINE FIELD payee_name   ON sepa_payment TYPE string;
DEFINE FIELD iban         ON sepa_payment TYPE string;
DEFINE FIELD bic          ON sepa_payment TYPE string;
DEFINE FIELD amount       ON sepa_payment TYPE decimal;
DEFINE FIELD reference    ON sepa_payment TYPE option<string>;
DEFINE FIELD execution_date ON sepa_payment TYPE datetime;
DEFINE FIELD status       ON sepa_payment TYPE string
  DEFAULT 'draft'
  ASSERT $value IN ['draft', 'exported', 'confirmed'];
DEFINE FIELD batch_id     ON sepa_payment TYPE option<string>;
DEFINE FIELD created_at   ON sepa_payment TYPE datetime DEFAULT time::now();

-- Index for efficient batch lookups
DEFINE INDEX sepa_payment_batch ON sepa_payment FIELDS batch_id;
DEFINE INDEX sepa_payment_status ON sepa_payment FIELDS status;
