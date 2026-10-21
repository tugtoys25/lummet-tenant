-- 0061_content_landing_pages.sql
--
-- Generic-content counterpart to the casino-only seo_pages system
-- (migration 0019: country x category matrix, casino_grid/casino_editorial/
-- casino_spotlights sections, casino_mode builder). That system is
-- casino-specific throughout (casino selection, casino eligibility,
-- casino-shaped sections) and is left completely untouched here.
--
-- This is a deliberately smaller, separate system for sportsbook /
-- affiliate_partner / custom landing pages: one grid of items, manual
-- or auto selection, no country x category matrix, no section builder.
-- Purely additive -- no existing table is touched.

CREATE TABLE IF NOT EXISTS content_landing_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    content_type TEXT NOT NULL CHECK (content_type IN ('sportsbook', 'affiliate_partner', 'custom')),
    custom_type_slug TEXT REFERENCES custom_content_types(slug), -- set only when content_type = 'custom'

    slug TEXT NOT NULL UNIQUE, -- globally unique: public URL is /en/best/:slug, no content_type segment
    title TEXT NOT NULL,
    description TEXT,

    -- manual -> only content_landing_page_items rows, editor-curated order
    -- auto   -> top N published + GEO-eligible items of this content_type
    --           (+ custom_type_slug when set), ranked featured DESC, rating DESC
    item_mode TEXT NOT NULL DEFAULT 'manual' CHECK (item_mode IN ('manual', 'auto')),
    auto_limit INTEGER NOT NULL DEFAULT 10,

    status TEXT NOT NULL DEFAULT 'draft', -- draft | published (same two-state gate as comparisons.status)

    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT,

    author_id INTEGER REFERENCES authors(id),
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_content_landing_pages_type ON content_landing_pages(content_type);

CREATE TABLE IF NOT EXISTS content_landing_page_items (
    landing_page_id INTEGER NOT NULL REFERENCES content_landing_pages(id) ON DELETE CASCADE,
    content_id INTEGER NOT NULL, -- content_items.id; content_type is the parent page's, not stored per-row (a landing page is single-type)
    position INTEGER DEFAULT 0,
    PRIMARY KEY (landing_page_id, content_id)
);

-- Same "editor can create/edit, only admin can delete" bar as
-- content_items/comparisons above (migration 0051's exact pattern).
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'content_landing_pages', 'read',   1),
    ('editor', 'content_landing_pages', 'create', 1),
    ('editor', 'content_landing_pages', 'update', 1),
    ('editor', 'content_landing_pages', 'delete', 0),
    ('admin',  'content_landing_pages', 'read',   1),
    ('admin',  'content_landing_pages', 'create', 1),
    ('admin',  'content_landing_pages', 'update', 1),
    ('admin',  'content_landing_pages', 'delete', 1);
