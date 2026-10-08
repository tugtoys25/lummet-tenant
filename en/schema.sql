-- =====================================================
-- LEVELCASINO CMS
-- Cloudflare D1 Schema v1
-- =====================================================

PRAGMA foreign_keys = ON;

-- =====================================================
-- USERS
-- =====================================================

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,

    role TEXT NOT NULL DEFAULT 'editor',

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email
ON users(email);

-- =====================================================
-- SESSIONS
-- =====================================================

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,

    user_id INTEGER NOT NULL,

    expires_at DATETIME NOT NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX idx_sessions_user
ON sessions(user_id);

-- =====================================================
-- COUNTRIES
-- =====================================================

CREATE TABLE countries (
    code TEXT PRIMARY KEY,

    name TEXT NOT NULL,

    currency TEXT,
    language TEXT,

    legal_status TEXT,

    seo_title TEXT,
    seo_description TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CASINOS
-- =====================================================

CREATE TABLE casinos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT UNIQUE NOT NULL,

    name TEXT NOT NULL,

    logo TEXT,

    website_url TEXT NOT NULL,

    affiliate_url TEXT NOT NULL,

    rating REAL DEFAULT 0,

    bonus_title TEXT,
    bonus_value TEXT,

    license TEXT,
    owner TEXT,

    features TEXT,

    supported_countries TEXT,

    restricted_countries TEXT,

    seo_title TEXT,
    seo_description TEXT,

    published INTEGER DEFAULT 1,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_casinos_slug
ON casinos(slug);

CREATE INDEX idx_casinos_published
ON casinos(published);

-- =====================================================
-- GEO RULES
-- =====================================================

CREATE TABLE geo_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    casino_slug TEXT NOT NULL,

    country_code TEXT NOT NULL,

    status TEXT NOT NULL,

    bonus_override TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_geo_casino
ON geo_rules(casino_slug);

CREATE INDEX idx_geo_country
ON geo_rules(country_code);

-- =====================================================
-- REVIEWS
-- =====================================================

CREATE TABLE reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    casino_slug TEXT NOT NULL,

    country_code TEXT,

    slug TEXT UNIQUE NOT NULL,

    title TEXT NOT NULL,

    content TEXT NOT NULL,

    pros TEXT,

    cons TEXT,

    rating REAL,

    seo_title TEXT,
    seo_description TEXT,

    ai_generated INTEGER DEFAULT 0,

    published INTEGER DEFAULT 1,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reviews_slug
ON reviews(slug);

CREATE INDEX idx_reviews_casino
ON reviews(casino_slug);

CREATE INDEX idx_reviews_country
ON reviews(country_code);

-- =====================================================
-- NEWS
-- =====================================================

CREATE TABLE news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT UNIQUE NOT NULL,

    title TEXT NOT NULL,

    content TEXT NOT NULL,

    author TEXT,

    ai_generated INTEGER DEFAULT 0,

    seo_title TEXT,
    seo_description TEXT,

    published INTEGER DEFAULT 1,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_news_slug
ON news(slug);

-- =====================================================
-- CATEGORIES
-- =====================================================

CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT UNIQUE NOT NULL,

    name TEXT NOT NULL,

    description TEXT,

    seo_title TEXT,
    seo_description TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_categories_slug
ON categories(slug);

-- =====================================================
-- DYNAMIC PAGES
-- =====================================================

CREATE TABLE pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT UNIQUE NOT NULL,

    type TEXT NOT NULL,

    template TEXT NOT NULL,

    title TEXT NOT NULL,

    content_json TEXT,

    seo_title TEXT,
    seo_description TEXT,

    ai_generated INTEGER DEFAULT 0,

    published INTEGER DEFAULT 1,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pages_slug
ON pages(slug);

CREATE INDEX idx_pages_type
ON pages(type);

-- =====================================================
-- CLICK TRACKING
-- Keep because affiliate sites need it
-- =====================================================

CREATE TABLE clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    casino_slug TEXT NOT NULL,

    country_code TEXT,

    city TEXT,

    ip_hash TEXT,

    user_agent TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_clicks_casino
ON clicks(casino_slug);

CREATE INDEX idx_clicks_date
ON clicks(created_at);

-- =====================================================
-- AI GENERATION HISTORY
-- Useful for dashboard auditing
-- =====================================================

CREATE TABLE ai_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    entity_type TEXT NOT NULL,

    entity_slug TEXT NOT NULL,

    prompt TEXT,

    model TEXT,

    status TEXT DEFAULT 'completed',

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_entity
ON ai_generations(entity_slug);

-- =====================================================
-- SETTINGS
-- Global CMS settings
-- =====================================================

CREATE TABLE settings (
    key TEXT PRIMARY KEY,

    value TEXT,

    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    filename TEXT NOT NULL,
    url TEXT NOT NULL,

    mime_type TEXT,
    size INTEGER,

    uploaded_by INTEGER,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER,

    action TEXT,

    entity_type TEXT,

    entity_id TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE casino_categories (
    casino_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,

    PRIMARY KEY (casino_id, category_id),

    FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE INDEX idx_cc_casino
ON casino_categories(casino_id);

CREATE INDEX idx_cc_category
ON casino_categories(category_id);

CREATE TABLE affiliates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    casino_slug TEXT,
    network TEXT,
    manager_name TEXT,
    manager_email TEXT,
    revshare REAL,
    cpa REAL,
    hybrid TEXT,
    tracking_url TEXT,
    status TEXT DEFAULT 'active'
);

-- ==========================================
-- LEVEL.CASINO PHASE 2 UPGRADE
-- ==========================================

-- CASINOS
ALTER TABLE casinos ADD COLUMN featured INTEGER DEFAULT 0;
ALTER TABLE casinos ADD COLUMN sort_order INTEGER DEFAULT 0;
ALTER TABLE casinos ADD COLUMN status TEXT DEFAULT 'draft';
ALTER TABLE casinos ADD COLUMN logo_media_id INTEGER;
ALTER TABLE casinos ADD COLUMN hero_image_media_id INTEGER;

-- REVIEWS
ALTER TABLE reviews ADD COLUMN overview TEXT;
ALTER TABLE reviews ADD COLUMN games TEXT;
ALTER TABLE reviews ADD COLUMN bonuses TEXT;
ALTER TABLE reviews ADD COLUMN payments TEXT;
ALTER TABLE reviews ADD COLUMN licenses TEXT;
ALTER TABLE reviews ADD COLUMN faq_json TEXT;
ALTER TABLE reviews ADD COLUMN verdict TEXT;

-- NEWS
ALTER TABLE news ADD COLUMN featured_image INTEGER;
ALTER TABLE news ADD COLUMN excerpt TEXT;
ALTER TABLE news ADD COLUMN tags TEXT;

-- MEDIA
ALTER TABLE media ADD COLUMN alt_text TEXT;
ALTER TABLE media ADD COLUMN width INTEGER;
ALTER TABLE media ADD COLUMN height INTEGER;
ALTER TABLE media ADD COLUMN folder TEXT;

-- GEO RULES
ALTER TABLE geo_rules ADD COLUMN priority INTEGER DEFAULT 0;
ALTER TABLE geo_rules ADD COLUMN redirect_url TEXT;


CREATE TABLE IF NOT EXISTS auth_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_hash TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip ON auth_attempts(ip_hash, action, created_at);
CREATE TABLE authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    bio TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'editor', -- editorial role: editor, senior_editor, contributor, expert
    email TEXT,
    social_links TEXT, -- JSON: {"twitter": "...", "linkedin": "..."}
    seo_title TEXT,
    seo_description TEXT,
    published INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE, -- optional, for reusable FAQ groups
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

