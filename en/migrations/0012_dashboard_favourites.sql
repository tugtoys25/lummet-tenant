-- Phase 8: dashboard favourites (links a person pinned in the global search).
-- Forward-only and idempotent. Per person, never shared. Without this table the search still works; only
-- pinning reports that it needs this migration.
CREATE TABLE IF NOT EXISTS dashboard_favourites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_key   TEXT    NOT NULL CHECK (length(user_key) BETWEEN 1 AND 120),
  href       TEXT    NOT NULL CHECK (length(href) BETWEEN 12 AND 300),
  label      TEXT    NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  kind       TEXT    NOT NULL DEFAULT 'screen' CHECK (kind IN ('screen', 'setting', 'capability', 'content')),
  created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_favourites_user_href ON dashboard_favourites(user_key, href);
