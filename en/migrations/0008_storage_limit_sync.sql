-- Phase 5.4: the control plane pushes the plan's storage cap with a monotone generation so a late or replayed push can
-- never lower or raise the cap out of order. generation 0 means the cap has never been set by the platform.
-- The generation lives in its own single-row table (not an ALTER TABLE ... ADD COLUMN) so the whole migration folder stays
-- re-applicable without changes, as test/migrations.test.js requires.
CREATE TABLE IF NOT EXISTS platform_storage_limit_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
  synced_at TEXT
);
INSERT OR IGNORE INTO platform_storage_limit_sync (id, generation) VALUES (1, 0);
