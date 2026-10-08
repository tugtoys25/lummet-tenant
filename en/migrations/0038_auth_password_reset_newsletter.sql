-- =====================================================
-- 0038_auth_password_reset_newsletter.sql
--
-- Adds the storage needed for:
--   * forgot-password / reset-password (password_resets)
--   * newsletter signup, incl. unauthenticated visitors who are not
--     registered `users` rows at all (newsletter_subscribers)
--
-- Purely additive: no existing table or column is touched.
-- =====================================================

-- ── Password reset tokens ──
-- Only a SHA-256 hash of the token is stored (never the raw token),
-- same principle as password_hash on `users` -- a leaked DB row
-- should not itself be usable to reset an account. The raw token is
-- generated in worker/auth.js, emailed once via Resend, and never
-- persisted.
CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,

    expires_at DATETIME NOT NULL,
    used_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token
ON password_resets(token_hash);

CREATE INDEX IF NOT EXISTS idx_password_resets_user
ON password_resets(user_id);

-- ── Newsletter subscribers ──
-- Deliberately separate from `users`: most newsletter signups are
-- anonymous site visitors typing an email into a footer form, not
-- people with an account. A registered user who also subscribes just
-- gets a row here with the same email -- no FK to `users` is required
-- for the newsletter to work.
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    email TEXT UNIQUE NOT NULL,

    -- 'pending' until the confirmation link is clicked (double opt-in),
    -- then 'confirmed'; 'unsubscribed' after opting out. Kept (not
    -- deleted) on unsubscribe so a repeat signup doesn't re-send a
    -- welcome email to someone who already opted out, and so
    -- unsubscribe/resubscribe has a history.
    status TEXT NOT NULL DEFAULT 'pending',

    -- Used for both the confirm link and the unsubscribe link, so
    -- neither action requires the subscriber to be logged in.
    token TEXT UNIQUE NOT NULL,

    subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME,
    unsubscribed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_token
ON newsletter_subscribers(token);
