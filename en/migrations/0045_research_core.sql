-- =====================================================
-- 0045_research_core.sql
-- Research Engine — Phase 1: core research_items table.
--
-- Purely additive. No existing table is altered or dropped.
-- research_items.country_id references countries(code) (TEXT,
-- the country table's real primary key — NOT an invented
-- integer id) so a research item can point at an existing
-- country row without ever duplicating country data. The same
-- principle will apply in later phases for casinos/categories/
-- payment_methods via a separate generic research_relations
-- table (not part of this migration).
--
-- content_json follows the exact same convention already used
-- by countries.content_json / categories.content_json /
-- seo_pages.content_json: { sections: [ {id, type, title, ...} ] }.
-- The renderer adds new section types (statistic, timeline,
-- source_citation, fact_card) alongside the existing ones
-- (rich_text, heading, image, faq, cta, internal_links, ...) —
-- see renderResearchSections in controllers.js. No existing
-- section type or existing page's rendering is touched.
--
-- status/published/robots/seo_* columns mirror countries/
-- categories exactly (same names, same defaults) so admin UI,
-- sitemap filtering, and the dynamic-SEO lookup all behave
-- identically to every other content type already in the site.
-- =====================================================

CREATE TABLE IF NOT EXISTS research_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Controlled type registry. Route + public template are
    -- derived from (type, slug) — never admin-typed URLs, per
    -- the "data-first, not route-first" principle.
    type TEXT NOT NULL CHECK (type IN (
        'report', 'country', 'regulator', 'topic',
        'development', 'legislation', 'licence'
    )),

    slug TEXT NOT NULL,

    title TEXT NOT NULL,
    subtitle TEXT,
    excerpt TEXT,

    -- { "sections": [ {id, type, title, ...}, ... ] } — same shape
    -- as countries.content_json / seo_pages.content_json.
    content_json TEXT,

    -- References the EXISTING countries table (countries.code is
    -- TEXT PRIMARY KEY, e.g. 'NL') — never a duplicated country
    -- record. NULL for types not tied to one country (e.g. a
    -- multi-country report or a cross-border topic).
    country_id TEXT REFERENCES countries(code),

    author_id INTEGER REFERENCES authors(id),

    -- Lifecycle — identical column names/defaults to countries/
    -- categories so every existing admin/sitemap/SEO helper that
    -- already knows this pattern needs zero special-casing.
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN (
            'draft', 'researching', 'source_review', 'fact_check',
            'editorial_review', 'approved', 'published',
            'needs_update', 'archived'
        )),
    published INTEGER NOT NULL DEFAULT 0,
    robots TEXT DEFAULT 'index,follow',

    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT,
    canonical_url TEXT,
    og_image INTEGER REFERENCES media_library(id),

    featured INTEGER NOT NULL DEFAULT 0,

    published_at DATETIME,
    last_verified_at DATETIME,
    next_review_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (type, slug)
);

CREATE INDEX IF NOT EXISTS idx_research_items_type ON research_items(type);
CREATE INDEX IF NOT EXISTS idx_research_items_published ON research_items(published);
CREATE INDEX IF NOT EXISTS idx_research_items_country ON research_items(country_id);
CREATE INDEX IF NOT EXISTS idx_research_items_status ON research_items(status);
CREATE INDEX IF NOT EXISTS idx_research_items_next_review ON research_items(next_review_at);

-- ── Permissions (role-level), same pattern as 0040_payment_methods.sql.
--    'admin' role bypasses the permission table entirely
--    (getPermissionsForUser returns null = all allowed), so only
--    'editor' rows are needed here. ──
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'research', 'read',   1),
    ('editor', 'research', 'create', 1),
    ('editor', 'research', 'update', 1),
    ('editor', 'research', 'delete', 1);
