-- Finance OS Financial Core
-- Core tables: account, payee, category, transaction, schedule

-- ─── Accounts ───────────────────────────────────────────────────────────────

DEFINE TABLE account SCHEMAFULL;
DEFINE FIELD name ON account TYPE string;
DEFINE FIELD type ON account TYPE string ASSERT $value IN ['checking', 'savings', 'credit', 'cash', 'investment'];
DEFINE FIELD balance ON account TYPE decimal;
DEFINE FIELD currency ON account TYPE string DEFAULT 'EUR';
DEFINE FIELD closed ON account TYPE bool DEFAULT false;
DEFINE FIELD sort_order ON account TYPE int DEFAULT 0;
DEFINE FIELD created_at ON account TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON account TYPE datetime DEFAULT time::now();

-- ─── Payees ─────────────────────────────────────────────────────────────────

DEFINE TABLE payee SCHEMAFULL;
DEFINE FIELD name ON payee TYPE string;
DEFINE FIELD transfer_account ON payee TYPE option<record<account>>;
DEFINE FIELD created_at ON payee TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_payee_name ON payee FIELDS name;

-- ─── Categories ─────────────────────────────────────────────────────────────

DEFINE TABLE category SCHEMAFULL;
DEFINE FIELD name ON category TYPE string;
DEFINE FIELD parent ON category TYPE option<record<category>>;
DEFINE FIELD color ON category TYPE option<string>;
DEFINE FIELD icon ON category TYPE option<string>;
DEFINE FIELD sort_order ON category TYPE int DEFAULT 0;
DEFINE FIELD is_income ON category TYPE bool DEFAULT false;
DEFINE FIELD created_at ON category TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_category_parent ON category FIELDS parent;

-- ─── Transactions ───────────────────────────────────────────────────────────

DEFINE TABLE transaction SCHEMAFULL;
DEFINE FIELD date ON transaction TYPE datetime;
DEFINE FIELD amount ON transaction TYPE decimal;
DEFINE FIELD account ON transaction TYPE record<account>;
DEFINE FIELD payee ON transaction TYPE option<record<payee>>;
DEFINE FIELD category ON transaction TYPE option<record<category>>;
DEFINE FIELD notes ON transaction TYPE option<string>;
DEFINE FIELD imported ON transaction TYPE bool DEFAULT false;
DEFINE FIELD cleared ON transaction TYPE bool DEFAULT false;
DEFINE FIELD reconciled ON transaction TYPE bool DEFAULT false;
DEFINE FIELD transfer_id ON transaction TYPE option<record<transaction>>;
DEFINE FIELD ai_confidence ON transaction TYPE option<float>;
DEFINE FIELD ai_classified ON transaction TYPE bool DEFAULT false;
DEFINE FIELD created_at ON transaction TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON transaction TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_transaction_date ON transaction FIELDS date;
DEFINE INDEX idx_transaction_account ON transaction FIELDS account;
DEFINE INDEX idx_transaction_category ON transaction FIELDS category;

-- ─── Schedules ──────────────────────────────────────────────────────────────

DEFINE TABLE schedule SCHEMAFULL;
DEFINE FIELD name ON schedule TYPE string;
DEFINE FIELD amount ON schedule TYPE decimal;
DEFINE FIELD account ON schedule TYPE record<account>;
DEFINE FIELD category ON schedule TYPE option<record<category>>;
DEFINE FIELD payee ON schedule TYPE option<record<payee>>;
DEFINE FIELD frequency ON schedule TYPE string ASSERT $value IN ['monthly', 'weekly', 'yearly', 'custom'];
DEFINE FIELD next_date ON schedule TYPE datetime;
DEFINE FIELD active ON schedule TYPE bool DEFAULT true;
DEFINE FIELD created_at ON schedule TYPE datetime DEFAULT time::now();
