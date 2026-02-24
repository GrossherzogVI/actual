-- Finance OS Contracts
-- Contract management with price history and events

-- ─── Contracts ──────────────────────────────────────────────────────────────

DEFINE TABLE contract SCHEMAFULL;
DEFINE FIELD name ON contract TYPE string;
DEFINE FIELD provider ON contract TYPE string;
DEFINE FIELD category ON contract TYPE option<record<category>>;
DEFINE FIELD type ON contract TYPE string ASSERT $value IN ['subscription', 'insurance', 'utility', 'loan', 'membership', 'other'];
DEFINE FIELD amount ON contract TYPE decimal;
DEFINE FIELD interval ON contract TYPE string ASSERT $value IN ['monthly', 'quarterly', 'semi-annual', 'annual', 'weekly', 'custom'];
DEFINE FIELD start_date ON contract TYPE option<datetime>;
DEFINE FIELD end_date ON contract TYPE option<datetime>;
DEFINE FIELD notice_period_months ON contract TYPE option<int>;
DEFINE FIELD auto_renewal ON contract TYPE bool DEFAULT true;
DEFINE FIELD status ON contract TYPE string DEFAULT 'active';
DEFINE FIELD created_at ON contract TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON contract TYPE datetime DEFAULT time::now();

-- Computed: annual cost normalized from interval
DEFINE FIELD annual_cost ON contract VALUE
  IF interval = 'monthly' THEN amount * 12
  ELSE IF interval = 'quarterly' THEN amount * 4
  ELSE IF interval = 'semi-annual' THEN amount * 2
  ELSE IF interval = 'annual' THEN amount
  ELSE IF interval = 'weekly' THEN amount * 52
  ELSE amount * 12
  END END END END END;

-- Computed: health badge based on status and end_date proximity
DEFINE FIELD health ON contract VALUE
  IF status = 'cancelled' THEN 'grey'
  ELSE IF end_date != NONE AND end_date - 30d < time::now() THEN 'red'
  ELSE IF end_date != NONE AND end_date - 60d < time::now() THEN 'yellow'
  ELSE 'green'
  END END END;

-- ─── Price History ──────────────────────────────────────────────────────────

DEFINE TABLE price_history SCHEMAFULL;
DEFINE FIELD contract ON price_history TYPE record<contract>;
DEFINE FIELD amount ON price_history TYPE decimal;
DEFINE FIELD effective_date ON price_history TYPE datetime;
DEFINE FIELD notes ON price_history TYPE option<string>;
DEFINE FIELD created_at ON price_history TYPE datetime DEFAULT time::now();

-- ─── Contract Events ────────────────────────────────────────────────────────

DEFINE TABLE contract_event SCHEMAFULL;
DEFINE FIELD contract ON contract_event TYPE record<contract>;
DEFINE FIELD type ON contract_event TYPE string;
DEFINE FIELD detail ON contract_event TYPE option<string>;
DEFINE FIELD created_at ON contract_event TYPE datetime DEFAULT time::now();
