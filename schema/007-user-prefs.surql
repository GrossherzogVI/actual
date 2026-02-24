DEFINE TABLE user_pref SCHEMAFULL;
DEFINE FIELD key ON user_pref TYPE string;
DEFINE FIELD value ON user_pref TYPE string;
DEFINE FIELD updated_at ON user_pref TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_user_pref_key ON user_pref FIELDS key UNIQUE;
