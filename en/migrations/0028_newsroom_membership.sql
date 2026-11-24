-- Newsroom membership and per-article access (additive only). The switch ships OFF; with it off every article is read exactly as before.
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('news_membership', 'false', CURRENT_TIMESTAMP);

-- Which articles are limited. No row = free for everyone.
CREATE TABLE IF NOT EXISTS news_access (
  news_id INTEGER PRIMARY KEY REFERENCES news(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'free',          -- free, registered (confirmed newsletter subscriber or member), members
  preview_paragraphs INTEGER NOT NULL DEFAULT 3,
  updated_by INTEGER REFERENCES users(id),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_access_level ON news_access(level);

-- Paying or invited readers. Filled by an editor or by a payment provider through the signed webhook.
CREATE TABLE IF NOT EXISTS news_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',       -- active, revoked
  tier TEXT,
  source TEXT NOT NULL DEFAULT 'manual',       -- manual or webhook
  external_id TEXT,
  note TEXT,
  expires_at DATETIME,                         -- empty = no end date
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_members_status ON news_members(status, expires_at);

-- One-time sign-in links (stored only as a hash, valid 15 minutes, used once).
CREATE TABLE IF NOT EXISTS news_member_logins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  ip_hash TEXT,
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_member_logins_email ON news_member_logins(email, created_at);
