-- =====================================================
-- 0047_research_relations.sql
-- Research Engine — Phase 3: the generic relationship graph.
--
-- Purely additive. This is the connective tissue the whole engine
-- was designed around: a research item can point at another
-- research item, OR at an EXISTING casino/country/category/
-- payment_method row, without ever duplicating that row's data
-- (spec section 16: "Do NOT duplicate existing casino records").
--
-- from_id/to_id are stored as TEXT regardless of the target
-- table's real primary-key type, because the polymorphic target
-- set mixes INTEGER PKs (casinos.id, categories.id,
-- payment_methods.id, research_items.id) with a TEXT PK
-- (countries.code). The application layer (research-relations.js)
-- always stringifies on write and casts appropriately per
-- from_type/to_type on read — this table itself carries no FK
-- constraint (SQLite can't express a polymorphic FK), so
-- referential integrity is enforced in the database module, not
-- by the schema. This mirrors how casino_categories/
-- casino_payment_methods already forgo FKs on their join columns
-- in this codebase.
-- =====================================================

CREATE TABLE IF NOT EXISTS research_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    from_type TEXT NOT NULL CHECK (from_type IN (
        'research_item', 'casino', 'country', 'category', 'payment_method'
    )),
    from_id TEXT NOT NULL,

    to_type TEXT NOT NULL CHECK (to_type IN (
        'research_item', 'casino', 'country', 'category', 'payment_method'
    )),
    to_id TEXT NOT NULL,

    -- Controlled registry (see RELATION_TYPES in research-relations.js)
    -- — never a free-text value from the admin UI, per spec section 14.
    relation_type TEXT NOT NULL CHECK (relation_type IN (
        'covers', 'located_in', 'operates_in', 'regulated_by', 'regulates',
        'licensed_by', 'requires', 'uses', 'related_to', 'part_of', 'contains',
        'updates', 'supersedes', 'superseded_by', 'cites', 'supports',
        'contradicts', 'derived_from', 'mentions', 'affects', 'affected_by',
        'applies_to', 'available_in', 'restricted_in'
    )),

    label TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary INTEGER NOT NULL DEFAULT 0,

    -- Qualified relationships (spec section 10): a relation can be
    -- time-bound and evidenced by a source, same as a claim.
    valid_from DATE,
    valid_until DATE,
    source_id INTEGER REFERENCES research_sources(id) ON DELETE SET NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (from_type, from_id, to_type, to_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_research_relations_from ON research_relations(from_type, from_id);
CREATE INDEX IF NOT EXISTS idx_research_relations_to ON research_relations(to_type, to_id);
CREATE INDEX IF NOT EXISTS idx_research_relations_type ON research_relations(relation_type);

-- ── Permissions (role-level), same pattern as 0045/0046. ──
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'research_relations', 'read',   1),
    ('editor', 'research_relations', 'create', 1),
    ('editor', 'research_relations', 'update', 1),
    ('editor', 'research_relations', 'delete', 1);
