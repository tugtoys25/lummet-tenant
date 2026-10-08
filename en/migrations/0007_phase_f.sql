-- =====================================================
-- PHASE F: DYNAMIC BANNER SYSTEM
-- =====================================================

CREATE TABLE IF NOT EXISTS banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT DEFAULT 'announcement',
    title TEXT,
    content TEXT,
    link TEXT,
    button_text TEXT,
    bg_color TEXT DEFAULT '#6c5ce7',
    text_color TEXT DEFAULT '#ffffff',
    position TEXT DEFAULT 'top',
    dismissible INTEGER DEFAULT 1,
    geo_countries TEXT,
    start_date TEXT,
    end_date TEXT,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_banners_enabled ON banners(enabled, position);
