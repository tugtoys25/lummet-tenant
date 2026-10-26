-- Site access state uses the existing key/value settings table. This additive migration records the feature's schema contract without changing tenant content schema.
CREATE TABLE IF NOT EXISTS tenant_site_access_state_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO tenant_site_access_state_meta (id, schema_version) VALUES (1, 1);
