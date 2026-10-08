-- =====================================================
-- MIGRATION 0012 — PLATFORM UPDATES
-- Internal Level.casino platform updates
-- =====================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS platform_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT UNIQUE NOT NULL,

    title TEXT NOT NULL,

    excerpt TEXT,

    content TEXT NOT NULL,

    featured_image INTEGER,

    seo_title TEXT,

    seo_description TEXT,

    author_id INTEGER,

    published INTEGER DEFAULT 1,

    featured INTEGER DEFAULT 0,

    published_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (author_id)
        REFERENCES authors(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_updates_slug
ON platform_updates(slug);

CREATE INDEX IF NOT EXISTS idx_platform_updates_published
ON platform_updates(published);

CREATE INDEX IF NOT EXISTS idx_platform_updates_date
ON platform_updates(published_at);

CREATE INDEX IF NOT EXISTS idx_platform_updates_author
ON platform_updates(author_id);

CREATE INDEX IF NOT EXISTS idx_platform_updates_featured
ON platform_updates(featured);
