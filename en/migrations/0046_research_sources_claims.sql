-- =====================================================
-- 0046_research_sources_claims.sql
-- Research Engine — Phase 2: source management + claim-level
-- research.
--
-- Purely additive on top of 0045_research_core.sql. Nothing in
-- research_items is altered.
--
-- research_sources is a GLOBAL, reusable table (an official
-- regulator page, a piece of legislation, a court judgment...)
-- — the same source can be cited by many claims and many
-- research items, so it is never duplicated per-item.
--
-- research_claims holds one factual statement per row, scoped
-- to a single research_item, independently verifiable and
-- independently timestamped — this is the "claims as qualified
-- statements with references" model from the spec (the
-- Wikidata-inspired concept, not its implementation).
--
-- research_claim_sources is the many-to-many join that actually
-- attaches evidence to a claim, with room for the exact quoted
-- text and where in the source it came from.
-- =====================================================

CREATE TABLE IF NOT EXISTS research_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    organisation TEXT NOT NULL,
    title TEXT,
    url TEXT,
    domain TEXT,

    source_type TEXT NOT NULL DEFAULT 'other' CHECK (source_type IN (
        'regulator', 'government', 'legislation', 'court',
        'eu_institution', 'official_register', 'operator',
        'industry_organization', 'academic', 'research_organization',
        'news', 'other'
    )),

    -- References the EXISTING countries table — never duplicated.
    country_id TEXT REFERENCES countries(code),

    is_primary INTEGER NOT NULL DEFAULT 0,
    document_type TEXT,
    language TEXT,

    publication_date DATE,
    accessed_at DATETIME,

    -- URL health, checked by the Phase 5 review-queue job.
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'broken', 'archived')),
    notes TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_research_sources_type ON research_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_research_sources_country ON research_sources(country_id);
CREATE INDEX IF NOT EXISTS idx_research_sources_status ON research_sources(status);


CREATE TABLE IF NOT EXISTS research_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    research_item_id INTEGER NOT NULL REFERENCES research_items(id) ON DELETE CASCADE,

    claim_text TEXT NOT NULL,
    claim_type TEXT DEFAULT 'fact',

    status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN (
        'unverified', 'verified', 'disputed', 'superseded'
    )),

    -- References the EXISTING countries table — never duplicated.
    jurisdiction_id TEXT REFERENCES countries(code),

    -- Regulatory reality changes; a claim can be time-bound
    -- (e.g. "the tax rate is 30.5%" valid_from 2025-01-01
    -- valid_until 2026-12-31).
    valid_from DATE,
    valid_until DATE,

    verified_at DATETIME,
    verified_by TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_research_claims_item ON research_claims(research_item_id);
CREATE INDEX IF NOT EXISTS idx_research_claims_status ON research_claims(status);
CREATE INDEX IF NOT EXISTS idx_research_claims_jurisdiction ON research_claims(jurisdiction_id);


CREATE TABLE IF NOT EXISTS research_claim_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    claim_id INTEGER NOT NULL REFERENCES research_claims(id) ON DELETE CASCADE,
    source_id INTEGER NOT NULL REFERENCES research_sources(id) ON DELETE CASCADE,

    -- Where in the source, and (optionally) the exact quoted
    -- text supporting the claim.
    citation_context TEXT,
    source_quote TEXT,

    support_type TEXT NOT NULL DEFAULT 'direct' CHECK (support_type IN (
        'direct', 'partial', 'contextual', 'disputed'
    )),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (claim_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_research_claim_sources_claim ON research_claim_sources(claim_id);
CREATE INDEX IF NOT EXISTS idx_research_claim_sources_source ON research_claim_sources(source_id);

-- ── Permissions (role-level), same pattern as 0045. Two separate
--    resources (not folded into 'research') so access can be
--    tuned independently later — e.g. a fact-checker role that
--    can edit claims/sources but not publish research items. ──
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'research_sources', 'read',   1),
    ('editor', 'research_sources', 'create', 1),
    ('editor', 'research_sources', 'update', 1),
    ('editor', 'research_sources', 'delete', 1),
    ('editor', 'research_claims',  'read',   1),
    ('editor', 'research_claims',  'create', 1),
    ('editor', 'research_claims',  'update', 1),
    ('editor', 'research_claims',  'delete', 1);
