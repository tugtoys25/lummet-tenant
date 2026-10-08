-- =====================================================
-- PHASE A-E: CACHING, MEDIA, NAV, PERMISSIONS, USER DASHBOARD
-- =====================================================

-- Phase B: Media Library
CREATE TABLE IF NOT EXISTS media_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    alt_text TEXT,
    width INTEGER,
    height INTEGER,
    mime_type TEXT,
    size INTEGER,
    folder TEXT DEFAULT 'general',
    uploaded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_media_folder ON media_library(folder);

-- Phase C: Dynamic Navigation
CREATE TABLE IF NOT EXISTS nav_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    url TEXT NOT NULL,
    parent_id INTEGER,
    position INTEGER DEFAULT 0,
    location TEXT DEFAULT 'header',
    is_external INTEGER DEFAULT 0,
    icon TEXT,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nav_location ON nav_items(location, enabled, position);

-- Phase D: Role-Based Permissions
CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    resource TEXT NOT NULL,
    action TEXT NOT NULL,
    allowed INTEGER DEFAULT 0,
    UNIQUE(role, resource, action)
);

-- Phase E: User Dashboard
CREATE TABLE IF NOT EXISTS user_bookmarks (
    user_id INTEGER NOT NULL,
    casino_slug TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, casino_slug)
);

CREATE TABLE IF NOT EXISTS user_inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    admin_reply TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inquiries_user ON user_inquiries(user_id, status);

CREATE TABLE IF NOT EXISTS user_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    link TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON user_notifications(user_id, is_read);

-- Phase E: User submitted casinos (for review)
CREATE TABLE IF NOT EXISTS casino_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    website_url TEXT NOT NULL,
    affiliate_url TEXT,
    bonus_value TEXT,
    notes TEXT,
    status TEXT DEFAULT 'pending',
    admin_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON casino_submissions(user_id, status);

-- Seed default permissions for admin (all allowed)
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('admin', 'casinos', 'create', 1), ('admin', 'casinos', 'read', 1), ('admin', 'casinos', 'update', 1), ('admin', 'casinos', 'delete', 1),
    ('admin', 'reviews', 'create', 1), ('admin', 'reviews', 'read', 1), ('admin', 'reviews', 'update', 1), ('admin', 'reviews', 'delete', 1),
    ('admin', 'news', 'create', 1), ('admin', 'news', 'read', 1), ('admin', 'news', 'update', 1), ('admin', 'news', 'delete', 1),
    ('admin', 'pages', 'create', 1), ('admin', 'pages', 'read', 1), ('admin', 'pages', 'update', 1), ('admin', 'pages', 'delete', 1),
    ('admin', 'components', 'create', 1), ('admin', 'components', 'read', 1), ('admin', 'components', 'update', 1), ('admin', 'components', 'delete', 1),
    ('admin', 'seo', 'create', 1), ('admin', 'seo', 'read', 1), ('admin', 'seo', 'update', 1), ('admin', 'seo', 'delete', 1),
    ('admin', 'settings', 'read', 1), ('admin', 'settings', 'update', 1),
    ('admin', 'authors', 'create', 1), ('admin', 'authors', 'read', 1), ('admin', 'authors', 'update', 1), ('admin', 'authors', 'delete', 1),
    ('admin', 'categories', 'create', 1), ('admin', 'categories', 'read', 1), ('admin', 'categories', 'update', 1), ('admin', 'categories', 'delete', 1),
    ('admin', 'countries', 'create', 1), ('admin', 'countries', 'read', 1), ('admin', 'countries', 'update', 1), ('admin', 'countries', 'delete', 1),
    ('admin', 'media', 'create', 1), ('admin', 'media', 'read', 1), ('admin', 'media', 'delete', 1),
    ('admin', 'nav', 'create', 1), ('admin', 'nav', 'read', 1), ('admin', 'nav', 'update', 1), ('admin', 'nav', 'delete', 1),
    ('admin', 'permissions', 'read', 1), ('admin', 'permissions', 'update', 1),
    ('admin', 'users', 'read', 1), ('admin', 'users', 'update', 1);

-- Seed default permissions for editor
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'casinos', 'read', 1),
    ('editor', 'reviews', 'create', 1), ('editor', 'reviews', 'read', 1), ('editor', 'reviews', 'update', 1),
    ('editor', 'news', 'create', 1), ('editor', 'news', 'read', 1), ('editor', 'news', 'update', 1),
    ('editor', 'pages', 'read', 1),
    ('editor', 'components', 'read', 1),
    ('editor', 'authors', 'read', 1),
    ('editor', 'categories', 'read', 1),
    ('editor', 'countries', 'read', 1),
    ('editor', 'media', 'create', 1), ('editor', 'media', 'read', 1);

-- Seed default header nav items
INSERT OR IGNORE INTO nav_items (label, url, position, location, enabled) VALUES
    ('Home', '/en', 1, 'header', 1),
    ('Casinos', '/en/casino', 2, 'header', 1),
    ('Reviews', '/en/review', 3, 'header', 1),
    ('News', '/en/news', 4, 'header', 1),
    ('Categories', '/en/category', 5, 'header', 1),
    ('Countries', '/en/country', 6, 'header', 1),
    ('Dashboard', '/en/dashboard', 7, 'header', 1);

-- Seed default footer nav items
INSERT OR IGNORE INTO nav_items (label, url, position, location, enabled) VALUES
    ('All Casinos', '/en/casino', 1, 'footer_casinos', 1),
    ('Reviews', '/en/review', 2, 'footer_casinos', 1),
    ('Crypto Casinos', '/en/category/crypto', 3, 'footer_casinos', 1),
    ('Categories', '/en/category', 4, 'footer_casinos', 1),
    ('Countries', '/en/country', 5, 'footer_casinos', 1),
    ('About Us', '/en/about-us', 1, 'footer_company', 1),
    ('Contact', '/en/contact', 2, 'footer_company', 1),
    ('News', '/en/news', 3, 'footer_company', 1),
    ('Responsible Gaming', '/en/responsible-gambling', 1, 'footer_support', 1),
    ('GambleAware', 'https://www.gambleaware.org/', 2, 'footer_support', 1),
    ('GamCare', 'https://www.gamcare.org.uk/', 3, 'footer_support', 1),
    ('Gambling Therapy', 'https://www.gamblingtherapy.org/', 4, 'footer_support', 1),
    ('Privacy Policy', '/en/privacy', 1, 'footer_legal', 1),
    ('Terms of Service', '/en/terms', 2, 'footer_legal', 1),
    ('Cookie Policy', '/en/cookies', 3, 'footer_legal', 1);
