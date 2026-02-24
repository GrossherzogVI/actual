DEFINE TABLE budget SCHEMAFULL;
DEFINE FIELD category ON budget TYPE record<category>;
DEFINE FIELD month ON budget TYPE string;
DEFINE FIELD amount ON budget TYPE decimal;
DEFINE FIELD rollover ON budget TYPE bool DEFAULT false;
DEFINE FIELD created_at ON budget TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON budget TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_budget_unique ON budget FIELDS category, month UNIQUE;
