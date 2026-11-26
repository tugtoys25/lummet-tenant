-- Live banner sliders: views and clicks per slide, one row per banner, slide and day (never one row per view).
-- Additive only. live_banner_stats (per banner) is untouched.
CREATE TABLE IF NOT EXISTS live_banner_slide_stats (
  banner_id INTEGER NOT NULL,
  slide_key TEXT NOT NULL,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (banner_id, slide_key, day)
);
