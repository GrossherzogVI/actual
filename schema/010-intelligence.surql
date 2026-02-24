DEFINE TABLE anomaly SCHEMAFULL;
DEFINE FIELD transaction ON anomaly TYPE option<record<transaction>>;
DEFINE FIELD type ON anomaly TYPE string;
DEFINE FIELD severity ON anomaly TYPE string DEFAULT 'medium';
DEFINE FIELD description ON anomaly TYPE string;
DEFINE FIELD explanation ON anomaly TYPE option<string>;
DEFINE FIELD resolved ON anomaly TYPE bool DEFAULT false;
DEFINE FIELD created_at ON anomaly TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_anomaly_resolved ON anomaly FIELDS resolved;

DEFINE TABLE spending_pattern SCHEMAFULL;
DEFINE FIELD type ON spending_pattern TYPE string;
DEFINE FIELD description ON spending_pattern TYPE string;
DEFINE FIELD payee_name ON spending_pattern TYPE option<string>;
DEFINE FIELD amount ON spending_pattern TYPE option<decimal>;
DEFINE FIELD frequency ON spending_pattern TYPE option<string>;
DEFINE FIELD confidence ON spending_pattern TYPE float DEFAULT 0.5;
DEFINE FIELD dismissed ON spending_pattern TYPE bool DEFAULT false;
DEFINE FIELD created_at ON spending_pattern TYPE datetime DEFAULT time::now();

-- Add explanation field to existing review_item
DEFINE FIELD explanation ON review_item TYPE option<string>;
