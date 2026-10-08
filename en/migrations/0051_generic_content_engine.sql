-- =====================================================
-- 0051_generic_content_engine.sql
-- Phase 2 — Compatibility Foundation (part 1 of 2)
--
-- PURELY ADDITIVE. No existing table is altered, dropped, or renamed
-- in this file. Every statement is CREATE TABLE IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, or an INSERT OR IGNORE against tables
-- created in this same file (settings/permissions rows only).
--
-- casinos, casino_categories, geo_rules, clicks, affiliate_partners,
-- affiliate_programs, affiliate_program_casinos, affiliate_accounts,
-- affiliate_commercial_terms are NOT touched anywhere in this file.
--
-- The one non-additive change (reviews table rebuild) is deliberately
-- kept in a separate file — 0052_reviews_generic_rebuild.sql — so it
-- can be reviewed, tested, and rolled back independently of this
-- file's much lower-risk additions.
-- =====================================================

PRAGMA foreign_keys = ON;

-- =====================================================
-- CONTENT ITEMS — sportsbook, affiliate_partner, custom ONLY.
-- Casino data stays in `casinos`, untouched. See the application-level
-- resolver (content-resolver.js) for how casino rows are normalized
-- into the same shape without being copied here.
-- =====================================================

CREATE TABLE IF NOT EXISTS content_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    content_type TEXT NOT NULL CHECK (content_type IN ('sportsbook', 'affiliate_partner', 'custom')),
    custom_type_slug TEXT REFERENCES custom_content_types(slug),  -- set only when content_type = 'custom'

    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT,
    description TEXT,
    excerpt TEXT,

    logo_media_id INTEGER REFERENCES media_library(id),
    featured_image_media_id INTEGER REFERENCES media_library(id),

    website TEXT,
    rating REAL DEFAULT 0,

    -- Promoted to real columns per Phase 2 correction #5: these are
    -- exactly the kind of filterable/comparable attributes that must
    -- NOT live in an unstructured JSON blob. license/license_country
    -- mirror casinos.license precedent; the four booleans are the
    -- sportsbook feature flags the spec calls out (Phase 3) as
    -- filter-relevant (Phase 18). NULL/0 for content types where they
    -- don't apply (e.g. affiliate_partner, custom).
    license TEXT,
    license_country TEXT,
    live_betting INTEGER DEFAULT 0,
    pre_match INTEGER DEFAULT 0,
    cashout INTEGER DEFAULT 0,
    mobile_app INTEGER DEFAULT 0,

    -- Explicit relationship to the EXISTING commercial affiliate_partners
    -- entity (migration 0023). Nullable: an editorial affiliate_partner
    -- content item can exist with no commercial link at all (Phase 28:
    -- "a review must not break if commercial configuration is
    -- missing"), or can point at a real commercial partner so the
    -- public page can surface program/offer/tracking data alongside
    -- the editorial content. affiliate_partners itself is not modified
    -- or duplicated -- this is the only new pointer, and it is
    -- one-directional (content_items -> affiliate_partners), so the
    -- live commercial table needs zero schema changes.
    linked_affiliate_partner_id INTEGER REFERENCES affiliate_partners(id),

    -- Genuinely non-queryable auxiliary metadata ONLY (e.g. founding
    -- year, free-text notes). Anything filterable/sortable/comparable
    -- must be a real column or a normalized join table instead --
    -- see content_sports / content_currencies / content_payment_methods
    -- / content_geo / content_categories below.
    metadata_json TEXT,

    featured INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',          -- draft | scheduled | published | archived
    published INTEGER DEFAULT 0,

    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT,

    -- Same authorship/ownership conventions already used by casinos/
    -- reviews/news/pages (authors.js, item-access.js) so the existing
    -- author-byline system and user_item_access per-item scoping work
    -- against this table with zero new authorization code.
    author_id INTEGER REFERENCES authors(id),
    created_by INTEGER,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME,

    UNIQUE(content_type, slug)
);
CREATE INDEX IF NOT EXISTS idx_content_items_type_status ON content_items(content_type, status);
CREATE INDEX IF NOT EXISTS idx_content_items_slug ON content_items(content_type, slug);
CREATE INDEX IF NOT EXISTS idx_content_items_affiliate_partner ON content_items(linked_affiliate_partner_id);
CREATE INDEX IF NOT EXISTS idx_content_items_author ON content_items(author_id);
CREATE INDEX IF NOT EXISTS idx_content_items_created_by ON content_items(created_by);

-- =====================================================
-- CUSTOM CONTENT TYPES + TYPED CUSTOM FIELDS
-- Structured (not free-JSON) per Phase 2 correction #5's sibling
-- instruction (Phase 8 of the original spec): every field is typed,
-- and rich text/URLs are sanitized/validated on write by application
-- code (worker/sanitize.js), never stored as raw HTML.
-- =====================================================

CREATE TABLE IF NOT EXISTS custom_content_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    plural_label TEXT NOT NULL,
    icon TEXT,
    review_enabled INTEGER DEFAULT 1,
    comparison_enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custom_type_slug TEXT NOT NULL REFERENCES custom_content_types(slug) ON DELETE CASCADE,
    field_key TEXT NOT NULL,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (field_type IN
        ('text','textarea','number','boolean','url','date','select','multi_select','country','currency','image','rating')),
    options_json TEXT,          -- for select/multi_select only
    required INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    UNIQUE(custom_type_slug, field_key)
);
CREATE INDEX IF NOT EXISTS idx_custom_field_defs_type ON custom_field_definitions(custom_type_slug);

CREATE TABLE IF NOT EXISTS custom_field_values (
    content_item_id INTEGER NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    field_key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (content_item_id, field_key)
);

-- =====================================================
-- GENERIC CATEGORIES — additive, parallel to the existing
-- casino_categories join table, which is untouched and keeps serving
-- casino pages exactly as it does today.
-- =====================================================

CREATE TABLE IF NOT EXISTS content_categories (
    content_type TEXT NOT NULL,   -- 'casino' | 'sportsbook' | 'affiliate_partner' | 'custom'
    content_id INTEGER NOT NULL,  -- casinos.id (when content_type='casino') or content_items.id
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (content_type, content_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_content_categories_cat ON content_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_content_categories_lookup ON content_categories(content_type, content_id);

-- =====================================================
-- GENERIC GEO — additive, parallel to the existing geo_rules table,
-- which is untouched and keeps serving casino pages exactly as it
-- does today. Same status vocabulary as geo_rules for consistency.
-- =====================================================

CREATE TABLE IF NOT EXISTS content_geo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_type TEXT NOT NULL,
    content_id INTEGER NOT NULL,
    country_code TEXT NOT NULL REFERENCES countries(code),
    status TEXT NOT NULL,
    bonus_override TEXT,
    priority INTEGER DEFAULT 0,
    redirect_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_content_geo_lookup ON content_geo(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_content_geo_country ON content_geo(country_code);

-- =====================================================
-- NORMALIZED SPORTSBOOK ATTRIBUTES
-- Reuses the EXISTING payment_methods table (migration 0040) via a
-- new generic join, rather than creating a second payment-method
-- concept. Sports and currencies get their own small lookup tables
-- since nothing existing covers them.
-- =====================================================

CREATE TABLE IF NOT EXISTS sports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    icon_url TEXT,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS content_sports (
    content_type TEXT NOT NULL,
    content_id INTEGER NOT NULL,
    sport_id INTEGER NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
    PRIMARY KEY (content_type, content_id, sport_id)
);
CREATE INDEX IF NOT EXISTS idx_content_sports_sport ON content_sports(sport_id);

CREATE TABLE IF NOT EXISTS currencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,     -- ISO 4217 / common crypto code, e.g. 'USD', 'BTC'
    name TEXT NOT NULL,
    is_crypto INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS content_currencies (
    content_type TEXT NOT NULL,
    content_id INTEGER NOT NULL,
    currency_id INTEGER NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
    PRIMARY KEY (content_type, content_id, currency_id)
);
CREATE INDEX IF NOT EXISTS idx_content_currencies_currency ON content_currencies(currency_id);

CREATE TABLE IF NOT EXISTS content_payment_methods (
    content_type TEXT NOT NULL,
    content_id INTEGER NOT NULL,
    payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
    PRIMARY KEY (content_type, content_id, payment_method_id)
);
CREATE INDEX IF NOT EXISTS idx_content_payment_methods_pm ON content_payment_methods(payment_method_id);

-- =====================================================
-- COMPARISONS — new, first-class, SEO-indexable comparison pages.
-- The EXISTING component-engine `comparison_table` component type
-- (worker/component-engine.js, worker/database/components.js) is
-- left completely alone and keeps doing embedded mini-comparisons
-- inside other pages. This is the separate, persistent, routable
-- comparison-page engine (Phase 2 correction #7). Where useful, the
-- comparison-detail renderer MAY reuse the component engine's
-- rendering helpers for individual rows -- it does not need its own
-- parallel row-rendering logic -- but comparisons/comparison_items
-- are the source of truth for a comparison page's data, not the
-- components/page_components tables.
--
-- Both the comparison's items AND its editorial selection use an
-- explicit (item_type, item_id) pair -- never a single bare ID --
-- since either can point at either `casinos` or `content_items`
-- depending on content_type (Phase 2 correction #6).
-- =====================================================

CREATE TABLE IF NOT EXISTS comparisons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_type TEXT NOT NULL,        -- 'casino' | 'sportsbook' | 'affiliate_partner' | 'custom'
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    criteria_json TEXT,                -- ordered [{key,label}] list of comparison rows

    editorial_selection_item_type TEXT,  -- 'casino' | 'sportsbook' | 'affiliate_partner' | 'custom'; NULL = no pick
    editorial_selection_item_id INTEGER,

    status TEXT DEFAULT 'draft',
    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT,
    author_id INTEGER REFERENCES authors(id),
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME,
    UNIQUE(content_type, slug)
);
CREATE INDEX IF NOT EXISTS idx_comparisons_type_status ON comparisons(content_type, status);

CREATE TABLE IF NOT EXISTS comparison_items (
    comparison_id INTEGER NOT NULL REFERENCES comparisons(id) ON DELETE CASCADE,
    item_content_type TEXT NOT NULL,   -- 'casino' | 'sportsbook' | 'affiliate_partner' | 'custom'
    item_id INTEGER NOT NULL,          -- casinos.id or content_items.id depending on item_content_type
    position INTEGER DEFAULT 0,
    PRIMARY KEY (comparison_id, item_content_type, item_id)
);

-- =====================================================
-- REVIEW CRITERIA / SCORING ENGINE — additive, works with BOTH
-- existing casino reviews and new reviews once 0052 backfills every
-- review with (reviewed_content_type, reviewed_content_id).
-- =====================================================

CREATE TABLE IF NOT EXISTS review_criteria_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_type TEXT NOT NULL,       -- 'casino' | 'sportsbook' | 'affiliate_partner' | 'custom:{slug}'
    criterion_key TEXT NOT NULL,
    label TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    UNIQUE(content_type, criterion_key)
);

CREATE TABLE IF NOT EXISTS review_criteria_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    criterion_key TEXT NOT NULL,
    score REAL NOT NULL,
    UNIQUE(review_id, criterion_key)
);

-- =====================================================
-- RBAC — new resource strings registered into the EXISTING
-- permissions table, following the exact INSERT OR IGNORE pattern
-- migration 0023 used for affiliate_partners/programs/accounts.
-- No schema change to `permissions` itself.
-- =====================================================

INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'content_items',            'read',   1),
    ('editor', 'content_items',            'create', 1),
    ('editor', 'content_items',            'update', 1),
    ('editor', 'content_items',            'delete', 0),
    ('editor', 'comparisons',              'read',   1),
    ('editor', 'comparisons',              'create', 1),
    ('editor', 'comparisons',              'update', 1),
    ('editor', 'comparisons',              'delete', 0),
    ('editor', 'custom_content_types',     'read',   1),
    ('editor', 'custom_content_types',     'create', 0),  -- defining new types is an admin-level action
    ('editor', 'custom_content_types',     'update', 0),
    ('editor', 'custom_content_types',     'delete', 0),
    ('admin',  'content_items',            'read',   1),
    ('admin',  'content_items',            'create', 1),
    ('admin',  'content_items',            'update', 1),
    ('admin',  'content_items',            'delete', 1),
    ('admin',  'comparisons',              'read',   1),
    ('admin',  'comparisons',              'create', 1),
    ('admin',  'comparisons',              'update', 1),
    ('admin',  'comparisons',              'delete', 1),
    ('admin',  'custom_content_types',     'read',   1),
    ('admin',  'custom_content_types',     'create', 1),
    ('admin',  'custom_content_types',     'update', 1),
    ('admin',  'custom_content_types',     'delete', 1);

-- =====================================================
-- TENANT CONTENT-TYPE ENABLEMENT — one settings row per environment,
-- read once per request via the existing getSiteContext()/
-- getSiteSettings() path (site-context.js). Defaults every existing
-- environment to casino-only: nothing new appears anywhere (routes,
-- listings, search, sitemaps, nav) until a site explicitly turns a
-- type on. INSERT OR IGNORE so re-running this migration is a no-op
-- if the row already exists (never overwrites a value you've since
-- changed from the dashboard).
-- =====================================================

INSERT OR IGNORE INTO settings (key, value) VALUES
    ('content_types_enabled', '{"casino":true,"sportsbook":false,"affiliate_partner":false,"custom":false}');
