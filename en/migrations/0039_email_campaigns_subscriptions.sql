-- =====================================================
-- 0039_email_campaigns_subscriptions.sql
--
-- Adds:
--   * email_campaigns          -- admin-composed sends (manual + automatic),
--                                  one row per send, for the dashboard log
--   * newsletter_subscribers   -- extended with:
--       - user_id              -- links a subscriber row back to a registered
--                                 account (NULL for anonymous footer signups)
--       - notify_news / notify_casinos / notify_reviews / notify_weekly_report
--                               -- per-category opt-out, default ON so a new
--                                 subscriber auto-receives everything until
--                                 they turn something off
--       - source                -- 'footer' | 'registration' | 'admin', for
--                                  the subscriptions dashboard, not behavior
--
-- Purely additive: no existing table/column touched, no row rewritten.
-- =====================================================

CREATE TABLE IF NOT EXISTS email_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    subject TEXT NOT NULL,
    layout TEXT NOT NULL DEFAULT 'branded',
    body_html TEXT NOT NULL,
    body_text TEXT,

    -- 'all' | 'selected' | 'new' | 'custom' | 'subscribed' | 'auto:news' |
    -- 'auto:casino' | 'auto:review' | 'auto:weekly_digest'
    recipient_type TEXT NOT NULL,
    -- Free-form JSON describing exactly who was targeted (selected user
    -- ids, the custom email list, the "new user" day window, etc.) --
    -- kept for the admin log, never re-parsed to resend.
    recipient_meta TEXT,

    status TEXT NOT NULL DEFAULT 'sending',
    recipient_count INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,

    -- NULL for system-generated sends (content-publish notices, the
    -- weekly digest) -- only set for an admin-composed send.
    created_by INTEGER,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME,

    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_created
ON email_campaigns(created_at);

ALTER TABLE newsletter_subscribers ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE newsletter_subscribers ADD COLUMN notify_news INTEGER NOT NULL DEFAULT 1;
ALTER TABLE newsletter_subscribers ADD COLUMN notify_casinos INTEGER NOT NULL DEFAULT 1;
ALTER TABLE newsletter_subscribers ADD COLUMN notify_reviews INTEGER NOT NULL DEFAULT 1;
ALTER TABLE newsletter_subscribers ADD COLUMN notify_weekly_report INTEGER NOT NULL DEFAULT 1;
ALTER TABLE newsletter_subscribers ADD COLUMN source TEXT NOT NULL DEFAULT 'footer';

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_user
ON newsletter_subscribers(user_id);
