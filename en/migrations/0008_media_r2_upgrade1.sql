ALTER TABLE media_library ADD COLUMN r2_key TEXT;
ALTER TABLE media_library ADD COLUMN original_filename TEXT;
ALTER TABLE media_library ADD COLUMN type TEXT DEFAULT 'image';
ALTER TABLE media_library ADD COLUMN caption TEXT;
ALTER TABLE media_library ADD COLUMN duration INTEGER;
ALTER TABLE media_library ADD COLUMN poster_url TEXT;
ALTER TABLE media_library ADD COLUMN file_ext TEXT;

CREATE INDEX IF NOT EXISTS idx_media_type ON media_library(type);
CREATE INDEX IF NOT EXISTS idx_media_filename ON media_library(filename);

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

INSERT OR IGNORE INTO media_folders (name, slug) VALUES
('General','general'),
('Logos','logos'),
('Banners','banners'),
('Reviews','reviews'),
('News','news'),
('Pages','pages'),
('Videos','videos');

INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
('editor','media','update',1),
('editor','media','delete',1),
('viewer','media','read',1);
