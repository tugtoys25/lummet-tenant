// =====================================================
// SUPER API — CAPABILITY MANIFEST
// Static per-deployment description of which Super API
// resources this codebase version supports. Lummet reads
// this at handshake time to show/hide dashboard features
// per rule #16/#17 (capability + version discovery).
// =====================================================

// Version 2: added components, page_components ("blocks"),
// permissions matrix, nav_items, banners, and base64-JSON media
// upload. Existing v1 resources are unchanged — a Lummet control
// plane that only knows v1 can keep working against everything it
// already used; it just won't show the new resources until it
// checks capabilities/version again.
// Version 6: added SEO landing pages (country_custom /
// category_country) — seo_pages + seo_page_casinos.
// Version 7: added Affiliate Partner & Program Management (System 1),
// Offer & Bonus Management (System 2), and Tracking Link Management
// with GEO-aware redirect resolution and link health monitoring
// (System 3). commercial_terms is read+create only through this
// Super API (terms are versioned/immutable, no plain edit --
// superseding is a deliberate two-step action).
// Version 8: added Analytics -- analytics_overview (tenant-wide
// performance-by-dimension summary), analytics_revenue (tenant-wide
// daily revenue/commission time series, single-currency only, never
// silently summed across currencies), and tracking_health (current
// status counts + which links are currently unhealthy). All three are
// pre-aggregated summaries only -- raw analytics_events, individual
// visitor data, and the full tracking_link_health_checks history are
// deliberately NOT exposed through this API. report_definitions/
// report_runs, campaigns, and alerts are NOT exposed yet -- deferred
// pending confirmation the control plane needs report/alert data (not
// just analytics numbers) through this channel.
// Version 9: added Reports (list/get/create + trigger an ad-hoc run
// returning its output), Campaigns (full CRUD), and Alerts (list/create
// rules, list/acknowledge alerts) -- confirmed need from the control
// plane for all three. Report output returned via /reports/:id/run is
// aggregated KPI data, the same trust tier as the v8 analytics
// endpoints. Historical report_runs rows carry no stored row output
// (only status/row_count/error) -- nothing to leak by listing past
// runs. Alert-rule create/delete parity with the tenant dashboard's
// own admin-only gating; Super API's credential is already tenant-
// wide-admin-equivalent by design (see handlers-analytics.js).
//
// Version 9.1 (no version bump, manifest-only fix): payment_methods,
// inquiries, submissions, notifications, newsletter, seo,
// postback_configs, provider_adapter_configs, and import_batches were
// all already live routes in router.js (some since v1) but never
// listed here -- this manifest had simply drifted from the route
// table, it wasn't a deliberate omission. Backfilled below so
// /handshake and /capabilities report what this deployment actually
// supports.
//
// Version 10: added Editorial AI Tools (generate-review, generate-seo,
// generate-faqs, generate-schema, generate-outline, improve-content,
// suggest-links) -- generation-only wrappers around
// en/worker/ai/admin-tools.js, see handlers-ai.js header for scope.
// Requires env.AI configured on the tenant Worker; `available` from
// GET .../ai/availability (or `generated: false` from any generation
// route) tells the caller when it isn't, rather than a 500.
// Version 11: added Research Zone (research_items) -- full CRUD
// (list/get/create/update/delete) over worker/database/research.js.
// The 'research' role-permission rows have existed since migration
// 0045_research_core.sql (editor: read/create/update/delete) but no
// Super API route or control-plane screen ever surfaced them --
// this fills that gap. Same thin-wrapper convention as
// categories/countries above. Not registered in item-access.js's
// RESOURCE_REGISTRY: research_items has no created_by/owner column
// (verified against migrations/0045_research_core.sql), so 'own'
// scope has nothing to key off; role-level permissions plus
// 'all'/'none' default scope are what govern it for now.
// Version 12: added Newsroom Taxonomy -- sections, topics, entities,
// series (full CRUD; DELETE archives, never hard-deletes, matching
// worker/database/newsroom-taxonomy.js's own design). Thin wrapper
// around that module's existing generic listTaxonomy/
// saveTaxonomyItem/archiveTaxonomyItem (added with migration
// 0054_newsroom_foundation.sql). Article-level tagging of an
// individual article with these terms (setArticleRelations) is NOT
// exposed yet -- deferred to a later phase; this covers managing the
// taxonomy terms themselves. Four separate flags (one per route
// segment: newsroom-sections/-topics/-entities/-series) rather than
// one combined flag, so the control plane's per-resource capability
// check (which matches on the exact resource/route name) can gate
// each one independently.
// Version 13: added article-level Newsroom metadata + relations --
// PUT news/:id/newsroom-meta (article_type, section_id,
// primary_country, region_slug, content_class, labels, methodology,
// pr_* fields, disclosure_json -- the columns migration 0054 added
// directly to `news`, not reachable through the ordinary news update
// endpoint) and GET/PUT news/:id/newsroom-relations (topic_ids,
// series_ids, entities, countries, related -- the many-to-many join
// tables from the same migration). No new capability flag: both
// operate on the existing 'news' resource, same as
// alerts/:id/acknowledge didn't get its own flag under 'alerts'.
// Version 14: added Research Engine Phase 2 -- research-sources
// (global) and research-claims (scoped to a research_item_id) plus
// research-claim-sources (the evidence links). Thin wrapper around
// worker/database/research-sources.js and
// worker/database/research-claims.js (added with migration
// 0046_research_sources_claims.sql). DELETE on a source is a real
// hard delete, matching the tenant's own admin route. Two flags
// (not one) so the two resources can be gated independently, same
// reasoning as the four newsroom-taxonomy flags in v12. Relations/
// versions/review-queue/datasets (research's other four
// sub-systems, from migrations 0047-0050) are NOT exposed yet.
// Version 15: analytics parity for the control plane -- GET analytics-geo,
// GET analytics-health (scheduled-job health), POST analytics-aggregate /
// analytics-evaluate-alerts / analytics-run-due-reports (the dashboard's
// manual runs), and an additive `name` on every analytics-overview row.
// All under the existing 'analytics' capability flag (no new flag).
export const SUPER_API_VERSION = 15;

export const CAPABILITIES = {
  casinos: true,
  reviews: true,
  news: true,
  pages: true,
  categories: true,
  countries: true,
  authors: true,
  media: true,
  media_upload: true,
  settings: true,
  users: true,
  components: true,
  page_components: true,
  permissions: true,
  item_access: true,
  review_blocks: true,
  ad_rules: true,
  updates: true,
  seo_pages: true,
  nav_items: true,
  banners: true,
  affiliate_partners: true,
  affiliate_programs: true,
  affiliate_accounts: true,
  commercial_terms: true,
  offers: true,
  tracking_links: true,
  analytics: true,
  reports: true,
  campaigns: true,
  alerts: true,
  payment_methods: true,
  inquiries: true,
  submissions: true,
  notifications: true,
  newsletter: true,
  seo: true,
  postback_configs: true,
  provider_adapter_configs: true,
  import_batches: true,
  ai_tools: true,
  research: true,
  "newsroom-sections": true,
  "newsroom-topics": true,
  "newsroom-entities": true,
  "newsroom-series": true,
  "research-sources": true,
  "research-claims": true
};

export function getCapabilities() {
  return { ...CAPABILITIES };
}
