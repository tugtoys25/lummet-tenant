-- =====================================================
-- 0043_ai_free_tier_usage.sql
-- Lummet AI public access gate: anonymous (not logged in)
-- visitors get FREE_MESSAGE_LIMIT (3, see worker/ai/security.js)
-- messages before being asked to register/login. Tracked by
-- hashed IP (same hashIP() already used for ai_rate_limits) so
-- resetting the client-side session_id doesn't reset the count.
--
-- Once a visitor registers/logs in, their session's ai_conversations
-- row picks up user_id and this table is no longer consulted for
-- that session -- the chat naturally continues under their account
-- via worker/ai/memory.js (same session_id, now user-owned).
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_free_tier_usage (
    ip_hash TEXT PRIMARY KEY,
    message_count INTEGER NOT NULL DEFAULT 0,
    first_message_at TEXT,
    last_message_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_free_tier_last ON ai_free_tier_usage(last_message_at);
