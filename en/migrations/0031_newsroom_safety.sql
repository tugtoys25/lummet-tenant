-- Newsroom safety tools (additive only): content backups and uptime / error alerts. Both switches ship OFF.
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_backups', 'false', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_monitoring', 'false', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS news_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'auto',
  bytes INTEGER NOT NULL DEFAULT 0,
  tables_json TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS news_health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ok INTEGER NOT NULL,
  ms INTEGER,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_news_health_at ON news_health_checks(checked_at);

CREATE TABLE IF NOT EXISTS news_error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at DATETIME DEFAULT CURRENT_TIMESTAMP,
  path TEXT,
  status INTEGER,
  message TEXT
);
CREATE INDEX IF NOT EXISTS idx_news_error_at ON news_error_log(at);
