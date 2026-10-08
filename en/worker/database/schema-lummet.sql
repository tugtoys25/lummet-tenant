-- =====================================================
-- LUMMET AI — Database Migration
-- Run: wrangler d1 execute <DB_NAME> --file=worker/database/schema-lummet.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id INTEGER,
  messages TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_session ON ai_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON ai_conversations(updated_at);

CREATE TABLE IF NOT EXISTS ai_rate_limits (
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (ip_hash, created_at)
);

-- Public/anonymous free-tier gate: FREE_MESSAGE_LIMIT (3, see
-- worker/ai/security.js) messages per IP before registration/login
-- is required. See migrations/0043_ai_free_tier_usage.sql.
CREATE TABLE IF NOT EXISTS ai_free_tier_usage (
  ip_hash TEXT PRIMARY KEY,
  message_count INTEGER NOT NULL DEFAULT 0,
  first_message_at TEXT,
  last_message_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_free_tier_last ON ai_free_tier_usage(last_message_at);
