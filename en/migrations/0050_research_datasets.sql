-- =====================================================
-- 0050_research_datasets.sql
-- Research Engine — Phase 6: reusable datasets + report
-- composition.
--
-- Purely additive. Report composition itself (spec section 17)
-- needed NO new join table: a report is just a research_item
-- whose content_json includes two new block types handled by
-- renderResearchSections() —
--   research_reference  { research_item_id, mode: 'live'|'snapshot' }
--   dataset_table        { dataset_id, version: 'latest'|N }
-- — so "Netherlands section of the 2026 report either always
-- shows the live Netherlands research item, or a frozen copy of
-- it" is just a block property, following the same content_json
-- convention every other research page already uses. See
-- controllers.js for the renderer, not this migration.
--
-- Datasets themselves DO need real tables, because a dataset
-- (e.g. "European Casino Regulation Dataset 2026") is reused
-- across multiple report sections/country pages and needs its
-- own version history independent of any one report.
-- =====================================================

CREATE TABLE IF NOT EXISTS research_datasets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,

    -- [{ key, label, type }] — column definitions. type is a
    -- display hint only (text/number/boolean/date), not enforced
    -- by the schema — rows_json is intentionally flexible.
    columns_json TEXT NOT NULL DEFAULT '[]',

    -- [{ <col_key>: value, ... }, ...] — the live/current rows.
    -- Historical rows live in research_dataset_versions below.
    rows_json TEXT NOT NULL DEFAULT '[]',

    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'published', 'needs_update', 'archived'
    )),
    published INTEGER NOT NULL DEFAULT 0,

    -- Dataset-level primary source (a per-row/per-cell source can
    -- still be noted inside rows_json if an editor wants that level
    -- of granularity — not schema-enforced, same flexibility as
    -- content_json elsewhere in this engine).
    source_id INTEGER REFERENCES research_sources(id) ON DELETE SET NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_research_datasets_status ON research_datasets(status);


CREATE TABLE IF NOT EXISTS research_dataset_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    dataset_id INTEGER NOT NULL REFERENCES research_datasets(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,

    columns_snapshot TEXT NOT NULL,
    rows_snapshot TEXT NOT NULL,

    changed_by TEXT,
    change_summary TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (dataset_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_research_dataset_versions_dataset ON research_dataset_versions(dataset_id);

-- ── Permissions (role-level), same pattern as every prior phase. ──
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'research_datasets', 'read',   1),
    ('editor', 'research_datasets', 'create', 1),
    ('editor', 'research_datasets', 'update', 1),
    ('editor', 'research_datasets', 'delete', 1);
