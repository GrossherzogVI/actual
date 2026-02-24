-- Finance OS API Endpoints
-- SurrealDB 3.0 DEFINE API for REST-style access

-- ─── Transactions ───────────────────────────────────────────────────────────

DEFINE API "/transactions" FOR get THEN {
  RETURN { status: 200, body: (SELECT * FROM transaction ORDER BY date DESC LIMIT 100) };
};

DEFINE API "/transactions" FOR post THEN {
  LET $tx = CREATE transaction CONTENT $request.body;
  RETURN { status: 201, body: $tx };
};

-- ─── Accounts ───────────────────────────────────────────────────────────────

DEFINE API "/accounts" FOR get THEN {
  RETURN { status: 200, body: (SELECT * FROM account WHERE closed = false ORDER BY sort_order) };
};

DEFINE API "/accounts" FOR post THEN {
  LET $acc = CREATE account CONTENT $request.body;
  RETURN { status: 201, body: $acc };
};

-- ─── Contracts ──────────────────────────────────────────────────────────────

DEFINE API "/contracts" FOR get THEN {
  RETURN { status: 200, body: (SELECT * FROM contract WHERE status != 'cancelled' ORDER BY name) };
};

DEFINE API "/contracts" FOR post THEN {
  LET $c = CREATE contract CONTENT $request.body;
  RETURN { status: 201, body: $c };
};

-- ─── Categories ─────────────────────────────────────────────────────────────

DEFINE API "/categories" FOR get THEN {
  RETURN { status: 200, body: (SELECT * FROM category ORDER BY sort_order) };
};

DEFINE API "/categories" FOR post THEN {
  LET $cat = CREATE category CONTENT $request.body;
  RETURN { status: 201, body: $cat };
};

-- ─── Dashboard Pulse ────────────────────────────────────────────────────────

DEFINE API "/dashboard/pulse" FOR get THEN {
  LET $total_balance = (SELECT math::sum(balance) AS total FROM account WHERE closed = false);
  LET $pending_reviews = (SELECT count() AS total FROM review_item WHERE status = 'pending' GROUP ALL);
  LET $active_contracts = (SELECT count() AS total FROM contract WHERE status = 'active' GROUP ALL);
  RETURN {
    status: 200,
    body: {
      total_balance: $total_balance,
      pending_reviews: $pending_reviews,
      active_contracts: $active_contracts
    }
  };
};
