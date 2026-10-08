-- =====================================================
-- 0054_newsroom_foundation.sql
-- Stage A of the newsroom upgrade: database additions ONLY.
--
-- GUARANTEES
--   * Purely additive: no DROP / DELETE / TRUNCATE / UPDATE of existing rows.
--   * Every existing news row keeps working with every new column NULL.
--   * Visibility of existing articles is untouched: it stays governed by
--     news.published + news.published_at exactly as today.
--   * CREATE TABLE / INDEX use IF NOT EXISTS and seeds use INSERT OR IGNORE,
--     so those statements are re-runnable. The ALTER TABLE ... ADD COLUMN
--     statements are NOT (SQLite limitation): run this file once per tenant DB.
--   * Requires 0045 (published_at) to have been applied or already present.
--
-- DESIGN RULES (why the schema looks the way it does)
--   1. Existing public code reads `SELECT n.*` from news, and
--      /api/v1/public/news/list returns those rows verbatim. Therefore
--      NOTHING internal may live as a column on `news`. Internal editorial
--      data (workflow owners, fact-check notes, editor notes) lives in
--      `news_editorial`, which no public query touches.
--   2. Child tables that hang off news use ON DELETE CASCADE so the existing
--      deleteNews flow can never be blocked by a new foreign key.
--      news_revisions and news_corrections deliberately carry NO foreign key:
--      they are journalism audit history and must survive (and must never
--      block) an article delete.
--   3. Type/status vocabularies are validated in application code, not CHECK
--      constraints, matching this codebase's convention (offers.js etc.).
--   4. Nothing tenant-specific is seeded. Sections/regions below are generic
--      defaults that any publication can edit or deactivate from admin.
-- =====================================================

-- ── 1. Editorial hierarchy ──────────────────────────
CREATE TABLE IF NOT EXISTS news_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    seo_title TEXT,
    seo_description TEXT,
    og_image INTEGER REFERENCES media_library(id),
    display_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    parent_id INTEGER REFERENCES news_sections(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_sections_active_order ON news_sections(active, display_order);
CREATE INDEX IF NOT EXISTS idx_news_sections_parent ON news_sections(parent_id);

CREATE TABLE IF NOT EXISTS news_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    seo_title TEXT,
    seo_description TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS news_regions (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
);

-- Maps the EXISTING countries(code) table onto a news region. No second
-- country system is created; this is only a grouping layer.
CREATE TABLE IF NOT EXISTS news_region_countries (
    region_slug TEXT NOT NULL REFERENCES news_regions(slug) ON DELETE CASCADE,
    country_code TEXT NOT NULL,
    PRIMARY KEY (region_slug, country_code)
);
CREATE INDEX IF NOT EXISTS idx_news_region_countries_country ON news_region_countries(country_code);

-- ── 2. Entities (companies, operators, regulators, people, orgs) ──
-- casino_id optionally links an entity to an existing casinos row so the
-- casino/operator directory is reused rather than duplicated.
CREATE TABLE IF NOT EXISTS news_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL DEFAULT 'company',   -- company|operator|regulator|person|organization
    description TEXT,
    logo_media_id INTEGER REFERENCES media_library(id),
    website_url TEXT,
    country_code TEXT,
    casino_id INTEGER REFERENCES casinos(id),
    seo_title TEXT,
    seo_description TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_entities_type ON news_entities(entity_type, active);
CREATE INDEX IF NOT EXISTS idx_news_entities_country ON news_entities(country_code);

-- ── 3. Series ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS news_series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    image_media_id INTEGER REFERENCES media_library(id),
    seo_title TEXT,
    seo_description TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── 4. Article <-> taxonomy join tables ─────────────
CREATE TABLE IF NOT EXISTS news_article_topics (
    news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    topic_id INTEGER NOT NULL REFERENCES news_topics(id) ON DELETE CASCADE,
    PRIMARY KEY (news_id, topic_id)
);
CREATE INDEX IF NOT EXISTS idx_news_article_topics_topic ON news_article_topics(topic_id, news_id);

CREATE TABLE IF NOT EXISTS news_article_countries (
    news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    country_code TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (news_id, country_code)
);
CREATE INDEX IF NOT EXISTS idx_news_article_countries_country ON news_article_countries(country_code, news_id);

CREATE TABLE IF NOT EXISTS news_article_entities (
    news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    entity_id INTEGER NOT NULL REFERENCES news_entities(id) ON DELETE CASCADE,
    role TEXT,                                     -- e.g. subject|mentioned|regulator
    display_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (news_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_news_article_entities_entity ON news_article_entities(entity_id, news_id);

CREATE TABLE IF NOT EXISTS news_series_articles (
    series_id INTEGER NOT NULL REFERENCES news_series(id) ON DELETE CASCADE,
    news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (series_id, news_id)
);
CREATE INDEX IF NOT EXISTS idx_news_series_articles_news ON news_series_articles(news_id);

-- Editorially selected related stories (automatic tag-based related news in
-- news.js getRelatedNews stays as the fallback).
CREATE TABLE IF NOT EXISTS news_related (
    news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    related_news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL DEFAULT 'related',  -- related|previous_coverage|follow_up|background|explainer|original_story
    display_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (news_id, related_news_id, relation_type)
);
CREATE INDEX IF NOT EXISTS idx_news_related_target ON news_related(related_news_id);

-- ── 5. Public sourcing ──────────────────────────────
-- Everything in this table is PUBLIC by design. Private source notes are NOT
-- stored here; they go in news_editorial_notes (internal).
CREATE TABLE IF NOT EXISTS news_article_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    source_name TEXT NOT NULL,
    source_url TEXT,                                -- validated http(s) only in app code; never fetched server-side
    source_type TEXT NOT NULL DEFAULT 'other',      -- official_statement|regulator|government|court_document|company_filing|press_release|interview|original_reporting|industry_report|research|other
    source_date TEXT,
    author TEXT,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_article_sources_news ON news_article_sources(news_id, display_order);

-- ── 6. Corrections, timeline ────────────────────────
-- No FK on news_id: correction history must never block or vanish with an
-- article delete. Public loaders select only type/public_message/created_at.
CREATE TABLE IF NOT EXISTS news_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    news_id INTEGER NOT NULL,
    type TEXT NOT NULL,                             -- correction|clarification|update|retraction
    public_message TEXT NOT NULL,
    created_by INTEGER,                             -- internal; never selected by public loaders
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_corrections_news ON news_corrections(news_id, created_at);

CREATE TABLE IF NOT EXISTS news_timeline_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    body TEXT NOT NULL,
    editor_id INTEGER,                              -- resolved to a display name by the loader
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_timeline_updates_news ON news_timeline_updates(news_id, update_time);

-- ── 7. Revision history (INTERNAL, admin-only) ──────
-- Field-level diffs, not full-body copies, wherever practical.
-- No FK on news_id (see header rule 2).
CREATE TABLE IF NOT EXISTS news_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    news_id INTEGER NOT NULL,
    version_number INTEGER NOT NULL,
    changed_by INTEGER,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    change_summary TEXT,
    changed_fields TEXT,                            -- JSON array of field names
    previous_values TEXT,                           -- JSON object, only changed fields
    new_values TEXT,                                -- JSON object, only changed fields
    UNIQUE (news_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_news_revisions_news ON news_revisions(news_id, version_number DESC);

-- ── 8. Internal editorial state (NEVER public) ──────
-- One row per article, created lazily. A missing row means "legacy article,
-- simple publishing" and must be treated as such by all code.
CREATE TABLE IF NOT EXISTS news_editorial (
    news_id INTEGER PRIMARY KEY REFERENCES news(id) ON DELETE CASCADE,
    workflow_status TEXT,                           -- idea|assigned|draft|editorial_review|fact_check|approved|scheduled|published|updated|corrected|retracted|archived
    assigned_to INTEGER,
    reviewed_by INTEGER,
    fact_check_status TEXT,                         -- not_checked|in_review|fact_checked|needs_correction
    fact_checked_by INTEGER,
    fact_checked_at DATETIME,
    approved_by INTEGER,
    published_by INTEGER,
    editor_notes TEXT,
    assignment_notes TEXT,
    fact_check_notes TEXT,
    revision_number INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_editorial_status ON news_editorial(workflow_status);
CREATE INDEX IF NOT EXISTS idx_news_editorial_assignee ON news_editorial(assigned_to, workflow_status);

CREATE TABLE IF NOT EXISTS news_editorial_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    note_type TEXT NOT NULL DEFAULT 'editor',       -- editor|assignment|fact_check|private_source
    body TEXT NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_editorial_notes_news ON news_editorial_notes(news_id, created_at);

-- ── 9. Editor pins / overrides for lead + trending ──
CREATE TABLE IF NOT EXISTS news_pins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    slot TEXT NOT NULL,                             -- lead|featured|trending
    position INTEGER NOT NULL DEFAULT 0,
    starts_at DATETIME,
    ends_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_pins_slot ON news_pins(slot, position);

-- ── 10. Additive columns on news (all PUBLIC-safe, all NULLable) ──
-- NULL article_type => 'news'; NULL content_class => 'editorial'.
-- These are intentionally safe to expose through the existing `n.*` reads.
ALTER TABLE news ADD COLUMN article_type TEXT;
ALTER TABLE news ADD COLUMN section_id INTEGER REFERENCES news_sections(id);
ALTER TABLE news ADD COLUMN primary_country TEXT;
ALTER TABLE news ADD COLUMN region_slug TEXT;
ALTER TABLE news ADD COLUMN content_class TEXT;     -- editorial|sponsored|commercial|press_release
ALTER TABLE news ADD COLUMN labels TEXT;            -- JSON array: breaking|developing|exclusive|analysis|investigation|interview|opinion|research|press_release
ALTER TABLE news ADD COLUMN methodology TEXT;       -- public "Reporting & Methodology" text
ALTER TABLE news ADD COLUMN pr_provided_by TEXT;
ALTER TABLE news ADD COLUMN pr_original_source_url TEXT;
ALTER TABLE news ADD COLUMN pr_original_date TEXT;
ALTER TABLE news ADD COLUMN disclosure_json TEXT;   -- per-article disclosure toggles

CREATE INDEX IF NOT EXISTS idx_news_article_type ON news(article_type);
CREATE INDEX IF NOT EXISTS idx_news_section ON news(section_id);
CREATE INDEX IF NOT EXISTS idx_news_primary_country ON news(primary_country);
CREATE INDEX IF NOT EXISTS idx_news_published_date ON news(published, published_at);

-- ── 11. Additive columns on authors (existing author URLs untouched) ──
ALTER TABLE authors ADD COLUMN job_title TEXT;
ALTER TABLE authors ADD COLUMN expertise TEXT;
ALTER TABLE authors ADD COLUMN location TEXT;
ALTER TABLE authors ADD COLUMN website_url TEXT;

-- ── 12. Additive media credit metadata (existing `caption`, `alt_text` reused) ──
ALTER TABLE media_library ADD COLUMN credit TEXT;
ALTER TABLE media_library ADD COLUMN photographer TEXT;
ALTER TABLE media_library ADD COLUMN credit_source TEXT;
ALTER TABLE media_library ADD COLUMN license TEXT;

-- ── 13. Generic seed data (editable / deactivatable from admin) ──
INSERT OR IGNORE INTO news_regions (slug, name, display_order) VALUES
    ('europe', 'Europe', 1),
    ('north-america', 'North America', 2),
    ('latin-america', 'Latin America', 3),
    ('asia', 'Asia', 4),
    ('africa', 'Africa', 5),
    ('oceania', 'Oceania', 6),
    ('middle-east', 'Middle East', 7);

INSERT OR IGNORE INTO news_sections (slug, name, display_order) VALUES
    ('regulation', 'Regulation', 1),
    ('markets', 'Markets', 2),
    ('operators', 'Operators', 3),
    ('companies', 'Companies', 4),
    ('technology', 'Technology', 5),
    ('payments', 'Payments', 6),
    ('sports-betting', 'Sports Betting', 7),
    ('online-casinos', 'Online Casinos', 8),
    ('responsible-gambling', 'Responsible Gambling', 9),
    ('legal-compliance', 'Legal & Compliance', 10),
    ('research-analysis', 'Research & Analysis', 11);

-- ── 14. Feature flags: every major newsroom feature ships OFF ──
INSERT OR IGNORE INTO system_settings (key, value) VALUES
    ('news_v2_homepage', 'false'),
    ('news_editorial_workflow', 'false'),
    ('news_new_taxonomy', 'false'),
    ('news_entity_pages', 'false'),
    ('news_trending', 'false'),
    ('news_corrections_display', 'false'),
    ('news_sources_display', 'false');

-- ── 15. Permissions: new actions are ADMIN-ONLY by default ──
-- Existing editor permissions (create/read/update on 'news') are untouched.
-- Grant more roles from the existing Permissions admin page as needed.
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('admin', 'news', 'review', 1),
    ('admin', 'news', 'factcheck', 1),
    ('admin', 'news', 'publish', 1),
    ('admin', 'news', 'schedule', 1),
    ('admin', 'news', 'correct', 1),
    ('admin', 'news', 'retract', 1),
    ('admin', 'news', 'manage_authors', 1),
    ('admin', 'news', 'manage_taxonomy', 1),
    ('admin', 'news', 'manage_sources', 1),
    ('admin', 'news', 'manage_settings', 1),
    ('admin', 'news', 'view_analytics', 1);
