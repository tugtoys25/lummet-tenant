-- =====================================================
-- MIGRATION 0014 — ITEM-LEVEL ACCESS CONTROL
-- Per-user, per-resource, per-item authorization layer
-- Sits ON TOP of the existing permissions table
-- Does NOT modify the permissions table
-- =====================================================

PRAGMA foreign_keys = ON;

-- =====================================================
-- 1. USER ITEM ACCESS — per-user scope policy
--    One row per (user_id, resource, action)
--    scope: 'none' | 'own' | 'all' | 'assigned'
--    No row = system default (see item-access.js DEFAULT_SCOPE)
-- =====================================================

CREATE TABLE IF NOT EXISTS user_item_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    resource TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT 'read',
    scope TEXT NOT NULL DEFAULT 'all',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, resource, action),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_item_access_user
ON user_item_access(user_id);

CREATE INDEX IF NOT EXISTS idx_user_item_access_resource
ON user_item_access(resource);

CREATE INDEX IF NOT EXISTS idx_user_item_access_user_resource
ON user_item_access(user_id, resource);

-- =====================================================
-- 2. ITEM ACCESS ASSIGNMENTS — per-item delegation
--    One row per (user_id, resource, item_id)
--    Used when scope = 'assigned'
-- =====================================================

CREATE TABLE IF NOT EXISTS item_access_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    resource TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    UNIQUE(user_id, resource, item_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_assignments_user
ON item_access_assignments(user_id);

CREATE INDEX IF NOT EXISTS idx_item_assignments_resource
ON item_access_assignments(resource);

CREATE INDEX IF NOT EXISTS idx_item_assignments_user_resource
ON item_access_assignments(user_id, resource);

CREATE INDEX IF NOT EXISTS idx_item_assignments_item
ON item_access_assignments(resource, item_id);

-- =====================================================
-- 3. SYSTEM DEFAULT SCOPE — explicit policy
--    Controls what happens when no user_item_access row exists
--    Default: 'all' during transition period
--    Change to 'none' after all users are configured
-- =====================================================

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO system_settings (key, value)
VALUES ('item_access_default_scope', 'all');

-- =====================================================
-- 4. OWNERSHIP COLUMNS — created_by on content tables
--    References users.id (authentication identity)
--    NOT author_id (which references authors.id = editorial byline)
--    Legacy records get NULL — behavior depends on scope:
--      OWN + NULL → DENY (NULL ≠ user.id)
--      ALL + NULL → ALLOW
--      ASSIGNED + NULL → ALLOW only if explicitly assigned
--      NONE + NULL → DENY
-- =====================================================

ALTER TABLE casinos ADD COLUMN created_by INTEGER;
ALTER TABLE reviews ADD COLUMN created_by INTEGER;
ALTER TABLE news ADD COLUMN created_by INTEGER;
ALTER TABLE pages ADD COLUMN created_by INTEGER;
ALTER TABLE platform_updates ADD COLUMN created_by INTEGER;

CREATE INDEX IF NOT EXISTS idx_casinos_created_by ON casinos(created_by);
CREATE INDEX IF NOT EXISTS idx_reviews_created_by ON reviews(created_by);
CREATE INDEX IF NOT EXISTS idx_news_created_by ON news(created_by);
CREATE INDEX IF NOT EXISTS idx_pages_created_by ON pages(created_by);
CREATE INDEX IF NOT EXISTS idx_platform_updates_created_by ON platform_updates(created_by);

-- media_library already has uploaded_by — no migration needed
