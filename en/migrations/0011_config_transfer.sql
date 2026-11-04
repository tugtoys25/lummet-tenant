-- Phase 7: saved presets and share links for exporting, importing and cloning a configuration.
-- Forward-only and idempotent (safe to run twice). Nothing here touches existing tables or data.
-- Without this file the platform keeps working: export and import (file or paste) still work, and the Presets and
-- Share panels on the Configuration screen report that they need this migration.

-- The owner's library of saved presets. `envelope` is the exported document (see worker/site-profile/transfer.js).
-- name_key is the lower-cased name, so "News Site" and "news site" cannot both exist.
CREATE TABLE IF NOT EXISTS config_presets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  name_key    TEXT    NOT NULL UNIQUE,
  description TEXT,
  envelope    TEXT    NOT NULL,
  sections    TEXT    NOT NULL DEFAULT '[]',
  created_by  TEXT,
  updated_by  TEXT,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Share links: let another site of yours copy this configuration. Only a SHA-256 hash of the token is stored, so a
-- database read never reveals a usable token. A share expires, has a use limit and can be revoked at any time.
CREATE TABLE IF NOT EXISTS config_shares (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash   TEXT    NOT NULL UNIQUE,
  label        TEXT,
  sections     TEXT    NOT NULL DEFAULT '[]',
  max_uses     INTEGER NOT NULL DEFAULT 5,
  uses         INTEGER NOT NULL DEFAULT 0,
  expires_at   TEXT    NOT NULL,
  created_by   TEXT,
  created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  revoked_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_config_shares_expires ON config_shares(expires_at);
