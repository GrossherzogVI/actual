-- Finance OS Intelligence
-- AI classification, review queue, smart matching, job queue

-- ─── Review Items ───────────────────────────────────────────────────────────

DEFINE TABLE review_item SCHEMAFULL;
DEFINE FIELD type ON review_item TYPE string;
DEFINE FIELD transaction ON review_item TYPE option<record<transaction>>;
DEFINE FIELD priority ON review_item TYPE string DEFAULT 'normal';
DEFINE FIELD ai_suggestion ON review_item TYPE option<object>;
DEFINE FIELD status ON review_item TYPE string DEFAULT 'pending';
DEFINE FIELD created_at ON review_item TYPE datetime DEFAULT time::now();
DEFINE FIELD resolved_at ON review_item TYPE option<datetime>;
DEFINE INDEX idx_review_item_status ON review_item FIELDS status;

-- ─── Classifications ────────────────────────────────────────────────────────

DEFINE TABLE classification SCHEMAFULL;
DEFINE FIELD transaction ON classification TYPE record<transaction>;
DEFINE FIELD model ON classification TYPE string;
DEFINE FIELD category ON classification TYPE record<category>;
DEFINE FIELD confidence ON classification TYPE float;
DEFINE FIELD classified_at ON classification TYPE datetime DEFAULT time::now();

-- ─── Smart Match Rules ──────────────────────────────────────────────────────

DEFINE TABLE smart_match_rule SCHEMAFULL;
DEFINE FIELD payee_pattern ON smart_match_rule TYPE string;
DEFINE FIELD category ON smart_match_rule TYPE record<category>;
DEFINE FIELD confidence ON smart_match_rule TYPE float DEFAULT 0.9;
DEFINE FIELD match_count ON smart_match_rule TYPE int DEFAULT 0;
DEFINE FIELD active ON smart_match_rule TYPE bool DEFAULT true;
DEFINE FIELD created_at ON smart_match_rule TYPE datetime DEFAULT time::now();

-- ─── Job Queue ──────────────────────────────────────────────────────────────

DEFINE TABLE job_queue SCHEMAFULL;
DEFINE FIELD name ON job_queue TYPE string;
DEFINE FIELD payload ON job_queue TYPE object;
DEFINE FIELD status ON job_queue TYPE string DEFAULT 'pending';
DEFINE FIELD claimed_by ON job_queue TYPE option<string>;
DEFINE FIELD claimed_at ON job_queue TYPE option<datetime>;
DEFINE FIELD visible_at ON job_queue TYPE datetime DEFAULT time::now();
DEFINE FIELD attempt ON job_queue TYPE int DEFAULT 0;
DEFINE FIELD max_attempts ON job_queue TYPE int DEFAULT 6;
DEFINE FIELD error_message ON job_queue TYPE option<string>;
DEFINE FIELD created_at ON job_queue TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_job_queue_status ON job_queue FIELDS status;
DEFINE INDEX idx_job_queue_visible ON job_queue FIELDS visible_at;
