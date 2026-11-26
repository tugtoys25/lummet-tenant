-- Per-visitor click counts in one-minute buckets, used only by Click protection (Settings > General) to spot a visitor
-- clicking tracked links far faster than a person can. New table, nothing existing is changed. Old buckets are pruned by the code.
CREATE TABLE IF NOT EXISTS go_click_velocity (
  visitor_hash TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (visitor_hash, bucket)
) WITHOUT ROWID;
