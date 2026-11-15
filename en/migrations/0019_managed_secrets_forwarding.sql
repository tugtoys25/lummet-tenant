-- Secrets managed from the dashboard (no Worker secret needed), and conversion forwarding to trackers and ad platforms.
CREATE TABLE IF NOT EXISTS postback_secrets (
  config_id INTEGER PRIMARY KEY REFERENCES postback_configs(id) ON DELETE CASCADE,
  secret_enc TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  rotated_at DATETIME
);

-- Only used when the Worker has no shared secret to derive an encryption key from.
CREATE TABLE IF NOT EXISTS site_secret_key (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  key_b64 TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversion_forwards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  kind TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  secret_enc TEXT,
  program_id INTEGER REFERENCES affiliate_programs(id),
  events_json TEXT NOT NULL DEFAULT '["ftd"]',
  statuses_json TEXT NOT NULL DEFAULT '["confirmed"]',
  status TEXT NOT NULL DEFAULT 'active',
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forward_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  forward_id INTEGER NOT NULL REFERENCES conversion_forwards(id) ON DELETE CASCADE,
  conversion_id INTEGER NOT NULL,
  conv_status TEXT NOT NULL,
  outcome TEXT NOT NULL,
  http_status INTEGER,
  detail TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (forward_id, conversion_id, conv_status)
);
CREATE INDEX IF NOT EXISTS idx_forward_deliveries_forward ON forward_deliveries(forward_id, id);
