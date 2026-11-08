-- Live banners: floating / edge / bar / inline promotional banners with templates.
-- Additive only. The older site-wide `banners` table is not touched.
CREATE TABLE IF NOT EXISTS live_banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','paused')),
  template_key TEXT NOT NULL,
  placement_mode TEXT NOT NULL DEFAULT 'floating',
  anchor TEXT NOT NULL DEFAULT 'bottom-right',
  offset_x INTEGER NOT NULL DEFAULT 16,
  offset_y INTEGER NOT NULL DEFAULT 16,
  z_tier INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,
  width_json TEXT NOT NULL DEFAULT '{}',
  height_json TEXT NOT NULL DEFAULT '{}',
  style_json TEXT NOT NULL DEFAULT '{}',
  motion_json TEXT NOT NULL DEFAULT '{}',
  trigger_json TEXT NOT NULL DEFAULT '{}',
  frequency_json TEXT NOT NULL DEFAULT '{}',
  targeting_json TEXT NOT NULL DEFAULT '{}',
  content_json TEXT NOT NULL DEFAULT '{}',
  dismissible INTEGER NOT NULL DEFAULT 1,
  start_at TEXT,
  end_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER
);

CREATE TABLE IF NOT EXISTS live_banner_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  banner_id INTEGER NOT NULL REFERENCES live_banners(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  overrides_json TEXT NOT NULL DEFAULT '{}'
);

-- Aggregate counters: one row per banner per day, never one row per view.
CREATE TABLE IF NOT EXISTS live_banner_stats (
  banner_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (banner_id, day)
);

CREATE INDEX IF NOT EXISTS idx_live_banners_serve ON live_banners (status, placement_mode, anchor, priority);
CREATE INDEX IF NOT EXISTS idx_live_banner_items_banner ON live_banner_items (banner_id, position);
