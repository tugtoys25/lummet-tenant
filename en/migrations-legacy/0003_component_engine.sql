-- =====================================================
-- PHASE 3: GLOBAL COMPONENT ENGINE
-- =====================================================

-- Universal content components (authors, faqs, sections, ctas, etc.)
CREATE TABLE IF NOT EXISTS components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    type TEXT NOT NULL,          -- author, faq_group, text, hero, cta, casino_grid, html, etc.
    title TEXT,
    content TEXT,                 -- JSON or raw text depending on type
    settings_json TEXT,           -- JSON settings (limit, country, etc.)
    status TEXT DEFAULT 'active', -- active, draft, archived
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_components_type ON components(type);
CREATE INDEX IF NOT EXISTS idx_components_slug ON components(slug);
CREATE INDEX IF NOT EXISTS idx_components_status ON components(status);

-- Universal page-component assignment
CREATE TABLE IF NOT EXISTS page_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_type TEXT NOT NULL,      -- homepage, review, casino, country, category, news, page, etc.
    page_slug TEXT NOT NULL,      -- e.g. "homepage", "fresh-casino-review", "RW", "crypto"
    component_id INTEGER NOT NULL,
    position INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pc_page ON page_components(page_type, page_slug);
CREATE INDEX IF NOT EXISTS idx_pc_component ON page_components(component_id);

-- Dynamic review blocks (replaces overview, games, bonuses, etc. columns)
CREATE TABLE IF NOT EXISTS review_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_slug TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rb_slug ON review_blocks(review_slug);

-- SEO metadata per page
CREATE TABLE IF NOT EXISTS seo_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_type TEXT NOT NULL,
    page_slug TEXT NOT NULL,
    title TEXT,
    description TEXT,
    keywords TEXT,
    canonical TEXT,
    og_image TEXT,
    schema_json TEXT,
    robots TEXT DEFAULT 'index, follow',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(page_type, page_slug)
);
CREATE INDEX IF NOT EXISTS idx_seo_page ON seo_meta(page_type, page_slug);
