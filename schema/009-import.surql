DEFINE TABLE import_batch SCHEMAFULL;
DEFINE FIELD name ON import_batch TYPE string;
DEFINE FIELD source ON import_batch TYPE string;
DEFINE FIELD row_count ON import_batch TYPE int DEFAULT 0;
DEFINE FIELD imported_count ON import_batch TYPE int DEFAULT 0;
DEFINE FIELD duplicate_count ON import_batch TYPE int DEFAULT 0;
DEFINE FIELD status ON import_batch TYPE string DEFAULT 'pending';
DEFINE FIELD created_at ON import_batch TYPE datetime DEFAULT time::now();
