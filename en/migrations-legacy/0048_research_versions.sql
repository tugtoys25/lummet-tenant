-- =====================================================
-- 0048_research_versions.sql
-- Research Engine — Phase 4: content versioning.
--
-- Purely additive. research_items itself is not altered — the
-- "current" row IS the current version; this table holds
-- historical snapshots taken whenever a save leaves the item
-- published, so regulatory research is never silently overwritten
-- (spec section 15/16: "Never silently overwrite important
-- historical research").
--
-- A snapshot is only written when the saved content actually
-- differs from the most recent snapshot (enforced in
-- research-versions.js, not here) — so re-saving an already-
-- published item with no changes does not spam the history.
-- =====================================================

CREATE TABLE IF NOT EXISTS research_item_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    research_item_id INTEGER NOT NULL REFERENCES research_items(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,

    -- Full snapshot of the versioned fields at save time (title,
    -- subtitle, excerpt, content_json, seo_*, status...), stored as
    -- JSON text — not just content_json — so a restore brings back
    -- everything, not only the body copy.
    content_snapshot TEXT NOT NULL,

    changed_by TEXT,
    change_summary TEXT,

    -- Set when this version was itself created by restoring an
    -- earlier one, so the history shows "restored from v3" rather
    -- than looking like fresh authored content.
    restored_from_version INTEGER,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (research_item_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_research_item_versions_item ON research_item_versions(research_item_id);

-- No new permission resource — versioning is part of editing a
-- research item, gated by the existing 'research' permission
-- (already granted to 'editor' in 0045).
