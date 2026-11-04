-- Phase 6: configuration draft, numbered versions and audit log.
-- Forward-only and idempotent (safe to run twice). Nothing here touches existing tables or data.
-- Without this file the platform keeps working: the Configuration screen reports that versioning needs
-- this migration, and direct saves still apply (they just are not recorded).

-- Every configuration that has gone live: the document is {v, profile, settings}.
CREATE TABLE IF NOT EXISTS config_versions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  version       INTEGER NOT NULL UNIQUE,
  document      TEXT    NOT NULL,
  source        TEXT    NOT NULL DEFAULT 'publish' CHECK (source IN ('baseline', 'publish', 'rollback', 'direct')),
  restored_from INTEGER,
  author        TEXT,
  author_role   TEXT,
  note          TEXT,
  summary       TEXT,
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- At most one working draft per site (id is pinned to 1). base_document is the configuration the draft started
-- from, so publishing applies only what the editor changed. revision rises on every autosave so two
-- people editing at once are told instead of silently overwriting each other.
CREATE TABLE IF NOT EXISTS config_draft (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  document     TEXT    NOT NULL,
  base_document TEXT,
  base_version INTEGER NOT NULL DEFAULT 0,
  revision     INTEGER NOT NULL DEFAULT 1,
  contributors TEXT    NOT NULL DEFAULT '[]',
  updated_by   TEXT,
  created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Who changed what and when. Never edited or deleted by the application.
CREATE TABLE IF NOT EXISTS config_audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  version    INTEGER,
  actor      TEXT,
  actor_role TEXT,
  action     TEXT NOT NULL,
  summary    TEXT,
  diff       TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_config_audit_created ON config_audit(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_config_versions_created ON config_versions(created_at DESC);
