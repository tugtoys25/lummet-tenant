-- =====================================================
-- PHASE 8: MEDIA R2 UPGRADE
-- Adds R2 integration columns, folder management, and
-- enhanced media metadata for the TinyMCE + Media Library upgrade.
-- All changes are additive — no existing columns are modified or removed.
-- =====================================================

-- ── media_library: new columns for R2 + enhanced metadata ──
ALTER TABLE media_library ADD COLUMN r2_key TEXT;
ALTER TABLE media_library ADD COLUMN original_filename TEXT;
ALTER TABLE media_library ADD COLUMN type TEXT DEFAULT 'image';
ALTER TABLE media_library ADD COLUMN caption TEXT;
ALTER TABLE media_library ADD COLUMN duration INTEGER;
ALTER TABLE media_library ADD COLUMN poster_url TEXT;
ALTER TABLE media_library ADD COLUMN file_ext TEXT;

-- Index for faster type filtering (image / video / document)
CREATE INDEX IF NOT EXISTS idx_media_type ON media_library(type);

-- Index for faster search by filename
CREATE INDEX IF NOT EXISTS idx_media_filename ON media_library(filename);

-- ── media_folders: folder management ──
CREATE TABLE IF NOT EXISTS media_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    parent_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES media_folders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_media_folders_slug ON media_folders(slug);
CREATE INDEX IF NOT EXISTS idx_media_folders_parent ON media_folders(parent_id);

-- ── Seed default folders ──
INSERT OR IGNORE INTO media_folders (name, slug) VALUES
    ('General', 'general'),
    ('Logos', 'logos'),
    ('Banners', 'banners'),
    ('Reviews', 'reviews'),
    ('News', 'news'),
    ('Pages', 'pages'),
    ('Videos', 'videos');

-- ── Add media permissions for editor (if not already present) ──
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'media', 'update', 1),
    ('editor', 'media', 'delete', 1);

-- ── Add 'media' resource read permission for viewer ──
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('viewer', 'media', 'read', 1);
