// =====================================================
// item-access.js — Item-Level Access Control Engine
// =====================================================
// Independent authorization layer that sits ON TOP of
// the existing role/resource permission system.
//
//   AUTHENTICATION
//       ↓
//   EXISTING permissions.js (resource-level gate)
//       ↓
//   THIS MODULE (item-level scope)
//       ↓
//   ALLOW / DENY
//
// Scopes: 'none' | 'own' | 'all' | 'assigned'
//
// DEFAULT SCOPE when no user_item_access row exists:
//   Read from system_settings table ('item_access_default_scope')
//   Falls back to 'all' during transition, change to 'none' for production
// =====================================================

// ── Resource Registry ──────────────────────────────
// Single source of truth for ownership mapping.
// Never scatter ownership logic across API endpoints.

const RESOURCE_REGISTRY = {
  'casinos':           { table: 'casinos',          idColumn: 'id', slugColumn: 'slug', ownerColumn: 'created_by' },
  'reviews':           { table: 'reviews',          idColumn: 'id', slugColumn: 'slug', ownerColumn: 'created_by' },
  'news':              { table: 'news',             idColumn: 'id', slugColumn: 'slug', ownerColumn: 'created_by' },
  'pages':             { table: 'pages',            idColumn: 'id', slugColumn: 'slug', ownerColumn: 'created_by' },
  'platform-updates':  { table: 'platform_updates', idColumn: 'id', slugColumn: 'slug', ownerColumn: 'created_by' },
  'media':             { table: 'media_library',    idColumn: 'id', slugColumn: null,   ownerColumn: 'uploaded_by' },
  'seo_pages':         { table: 'seo_pages',         idColumn: 'id', slugColumn: null,   ownerColumn: 'created_by' },
  // Affiliate Partner & Program Management (System 1)
  'affiliate_partners': { table: 'affiliate_partners',         idColumn: 'id', slugColumn: 'slug', ownerColumn: 'created_by' },
  'affiliate_programs': { table: 'affiliate_programs',         idColumn: 'id', slugColumn: null,   ownerColumn: 'created_by' },
  'affiliate_accounts': { table: 'affiliate_accounts',         idColumn: 'id', slugColumn: null,   ownerColumn: 'created_by' },
  'commercial_terms':   { table: 'affiliate_commercial_terms', idColumn: 'id', slugColumn: null,   ownerColumn: 'created_by' },
  'offers':             { table: 'offers',                     idColumn: 'id', slugColumn: null,   ownerColumn: 'created_by' },
  'tracking_links':     { table: 'tracking_links',              idColumn: 'id', slugColumn: null,   ownerColumn: 'created_by' },
  // Analytics / Reporting platform (Phase 2+) — registered the same
  // way as every other resource above. campaigns and
  // analytics_conversions are directly owned/CRUD'd resources;
  // analytics_events/analytics_daily are NOT registered here on
  // purpose — they are never accessed as owned "items" in their own
  // right, only aggregated through the dimensions they reference
  // (casinos, offers, tracking_links, ...), each of which already
  // has its own registry entry above. Scoping analytics queries means
  // resolving getAccessibleItemIds() for THOSE resources first, not
  // treating raw events as an item-access resource themselves.
  'campaigns':           { table: 'campaigns',           idColumn: 'id', slugColumn: null, ownerColumn: 'created_by' },
  'analytics_conversions': { table: 'analytics_conversions', idColumn: 'id', slugColumn: null, ownerColumn: 'created_by' },
  'report_definitions':  { table: 'report_definitions',  idColumn: 'id', slugColumn: null, ownerColumn: 'owner_id' },
  // Generic content engine (content_items/comparisons only --
  // custom_content_types has no owner column and is admin-only to
  // create/update per migration 0051's permission rows anyway, so
  // admins already bypass item-level checks entirely; registering it
  // here would add nothing). slugColumn is deliberately null for
  // both: content_items/comparisons slugs are unique per
  // (content_type, slug), not globally, so a bare `WHERE slug = ?`
  // lookup (what getItemBySlug does) could match the wrong row across
  // types -- id-based lookup (getItemById, or the item this project's
  // own controllers already fetch via content-items.js/comparisons.js)
  // is the only safe path here, so slug-based access checks are
  // intentionally left unavailable rather than silently wrong.
  'content_items': { table: 'content_items', idColumn: 'id', slugColumn: null, ownerColumn: 'created_by' },
  'comparisons':   { table: 'comparisons',   idColumn: 'id', slugColumn: null, ownerColumn: 'created_by' }
};

export const VALID_SCOPES = ['none', 'own', 'all', 'assigned'];

export const VALID_ACTIONS = ['create', 'read', 'update', 'delete'];

// Hard fallback if system_settings table doesn't exist yet
export const FALLBACK_DEFAULT_SCOPE = 'all';

// ── Registry helpers ──────────────────────────────

export function getResourceConfig(resource) {
  return RESOURCE_REGISTRY[resource] || null;
}

export function getRegisteredResources() {
  return Object.keys(RESOURCE_REGISTRY);
}
