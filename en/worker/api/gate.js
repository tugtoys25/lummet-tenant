// Sign-in check and role permission checks (read and write) for the admin API.
// Returns { response } to stop the request, or { userPermissions } to continue.
import * as permDB from "../database/permissions.js";
import { failure, json } from "./helpers.js";

export async function authorize(request, env, path, user) {

  // Lummet AI's public endpoints are intentionally reachable while
  // logged out -- that's how the free-tier (first 3 messages) flow
  // works before registration/login is required. Gating past that
  // point happens inside worker/ai/assistant.js, not here.
  const PUBLIC_AI_PATHS = [
    "/api/v1/ai/chat",
    "/api/v1/ai/chat/stream",
    "/api/v1/ai/chat/clear",
    "/api/v1/ai/feedback"
  ];

  if (!user && !PUBLIC_AI_PATHS.includes(path)) {
    return { response: failure("Unauthorized", 401) };
  }

    const userPermissions = await permDB.getPermissionsForUser(env.DB, user);

  // ── READ permission gate (GET requests) ──
  // Previously unreachable because it was nested inside writeMethods.
    // ── READ permission gate (GET requests) ──
  if (request.method === "GET") {
    const readResourceMap = {
      "/api/v1/component/pick-search": "components",
      // Casinos
      "/api/v1/casinos/list": "casinos",
      "/api/v1/casino/get": "casinos",
      "/api/v1/geo/list": "casinos",
      // Reviews
      "/api/v1/reviews/list": "reviews",
      "/api/v1/review-blocks/list": "reviews",
      // News
      "/api/v1/news/list": "news",
      // Pages
      "/api/v1/pages/list": "pages",
      // Categories
      "/api/v1/categories/list": "categories",
      "/api/v1/category/get-by-id": "categories",
      // Countries
      "/api/v1/countries/list": "countries",
      "/api/v1/country/get-by-id": "countries",
      "/api/v1/country/get-by-code": "countries",
      // Research
      "/api/v1/research/list": "research",
      "/api/v1/research/get": "research",
      "/api/v1/research/get-by-id": "research",
      "/api/v1/research/overdue": "research",
      "/api/v1/research-sources/list": "research_sources",
      "/api/v1/research-sources/get": "research_sources",
      "/api/v1/research-claims/list-for-item": "research_claims",
      "/api/v1/research-relations/list-for-entity": "research_relations",
      "/api/v1/research-relations/search-entities": "research_relations",
      "/api/v1/research-versions/list-for-item": "research",
      "/api/v1/research-versions/get": "research",
      "/api/v1/research-versions/diff": "research",
      "/api/v1/research-review-queue/summary": "research",
      "/api/v1/research-review-queue/list": "research",
      "/api/v1/research-datasets/list": "research_datasets",
      "/api/v1/research-datasets/get": "research_datasets",
      "/api/v1/research-datasets/get-by-slug": "research_datasets",
      "/api/v1/research-datasets/versions": "research_datasets",
      // Payment Methods
      "/api/v1/payment-methods/list": "payment_methods",
      "/api/v1/payment-method/get-by-id": "payment_methods",
      "/api/v1/payment-method/casinos": "payment_methods",
      "/api/v1/payment-method/eligible-casinos": "payment_methods",
      "/api/v1/casino/payment-methods": "casinos",
      // Authors
      "/api/v1/authors/list": "authors",
      "/api/v1/author/get": "authors",
      "/api/v1/author/content": "authors",
      // Components
      "/api/v1/components/list": "components",
      "/api/v1/component/get": "components",
      "/api/v1/components/page": "components",
      // SEO
      "/api/v1/seo/list": "seo",
      "/api/v1/seo/get": "seo",
      // Media
      "/api/v1/media/list": "media",
      "/api/v1/media/browse": "media",
      "/api/v1/media/search": "media",
      "/api/v1/media/get": "media",
      "/api/v1/media/folders": "media",
      "/api/v1/media/folders/tree": "media",
      "/api/v1/media/folder/count": "media",
      // Nav
      "/api/v1/nav/list": "nav",
      "/api/v1/nav/geo/list": "nav",
      // Settings
      "/api/v1/settings/get": "settings",
      // Permissions
      "/api/v1/permissions/list": "permissions",
      // Platform Updates
      "/api/v1/platform-updates/list": "platform-updates",
      // SEO landing pages
      "/api/v1/seo-pages/list": "seo_pages",
      "/api/v1/seo-pages/get": "seo_pages",
      "/api/v1/seo-pages/countries-search": "seo_pages",
      "/api/v1/seo-pages/eligible-casinos": "seo_pages",
      "/api/v1/seo-pages/discover": "seo_pages",
      // Ad Rules
      "/api/v1/ad-rules/list": "ad-rules",
      // Banners
      "/api/v1/banners/list": "banners",
      // Affiliate Partners (System 1 -- handlers land in Phase 3E)
      "/api/v1/affiliate-partners/list": "affiliate_partners",
      "/api/v1/affiliate-partner/get": "affiliate_partners",
      "/api/v1/affiliate-partner/contacts": "affiliate_partners",
      // Affiliate Programs
      "/api/v1/affiliate-programs/list": "affiliate_programs",
      "/api/v1/affiliate-program/get": "affiliate_programs",
      "/api/v1/affiliate-program/casinos": "affiliate_programs",
      "/api/v1/casino/affiliate-programs": "affiliate_programs",
      // Affiliate Accounts
      "/api/v1/affiliate-accounts/list": "affiliate_accounts",
      "/api/v1/affiliate-account/get": "affiliate_accounts",
      // Commercial Terms
      "/api/v1/commercial-terms/list": "commercial_terms",
      "/api/v1/commercial-terms/history": "commercial_terms",
      "/api/v1/commercial-terms/resolve": "commercial_terms",
      "/api/v1/commercial-term/get": "commercial_terms",
      // Postback Integrations (admin-only -- see migration 0033, no editor permission rows exist for this resource)
      "/api/v1/postback-configs/list": "postback_configs",
      "/api/v1/postback-config/get": "postback_configs",
      "/api/v1/postback-config/health": "postback_configs",
      "/api/v1/imports/list": "import_batches",
      "/api/v1/import/get": "import_batches",
      "/api/v1/provider-adapters/list": "provider_adapter_configs",
      "/api/v1/provider-adapter/get": "provider_adapter_configs",
      // Offers (System 2)
      "/api/v1/offers/list": "offers",
      "/api/v1/offer/get": "offers",
      "/api/v1/offer/history": "offers",
      "/api/v1/offer/as-of": "offers",
      "/api/v1/offer/candidates": "offers",
      "/api/v1/offer/resolve": "offers",
      // Tracking Links (System 3)
      "/api/v1/tracking-links/list": "tracking_links",
      "/api/v1/tracking-link/get": "tracking_links",
      "/api/v1/tracking-link/geo-destinations": "tracking_links",
      "/api/v1/tracking-link/health-history": "tracking_links",
      "/api/v1/tracking-link/resolve-preview": "tracking_links",
      // Analytics / Reporting (Phase 5)
      "/api/v1/analytics/overview": "analytics",
      "/api/v1/analytics/timeseries": "analytics",
      "/api/v1/analytics/geo": "analytics",
      "/api/v1/analytics/cron-health": "analytics",
      "/api/v1/analytics/conversions/list": "analytics_conversions",
      "/api/v1/campaigns/list": "campaigns",
      "/api/v1/campaign/get": "campaigns",
      "/api/v1/reports/list": "reports",
      "/api/v1/report/get": "reports",
      "/api/v1/report/runs/list": "reports",
      "/api/v1/report/column-options": "reports",
      "/api/v1/analytics/alerts/list": "analytics_alerts",
      "/api/v1/analytics/alert-rules/list": "analytics_alerts",
      // Generic content engine (Phase 8 hardening) -- these paths simply
      // weren't in this map before, so any authenticated user of any
      // role could list/read/search generic content regardless of the
      // RBAC rows migration 0051 already defines for it. Adding them
      // here closes that gap using the exact same read-gate mechanism
      // every other resource above uses -- no new authorization system,
      // just filling in missing rows. This is a *role*-level gate,
      // separate from (and layered under) the item-level
      // itemAccess.canAccessItem() checks already present on the
      // single-item get/update/delete endpoints.
      "/api/v1/content-items/list": "content_items",
      "/api/v1/content-item/get": "content_items",
      "/api/v1/content-item/search": "content_items",
      "/api/v1/content-item/custom-field-values": "content_items",
      "/api/v1/custom-types/list": "custom_content_types",
      "/api/v1/custom-type/fields": "custom_content_types",
      "/api/v1/comparisons/list": "comparisons",
      "/api/v1/comparison/get": "comparisons",
      "/api/v1/comparison/fields": "comparisons",
      "/api/v1/generic-reviews/list": "reviews", // was ungated on GET, same gap as the entries above
      "/api/v1/generic-review/get": "reviews",
      "/api/v1/content-landing-pages/list": "content_landing_pages",
      "/api/v1/content-landing-page/get": "content_landing_pages",
      // Sports/currencies are read-only reference/taxonomy lookups used
      // only to populate the sportsbook edit form's checkboxes -- same
      // supporting-reference-data posture as payment_methods above.
      // Gated under content_items since that's the resource an editor
      // is actually managing when they need this list.
      "/api/v1/sports/list": "content_items",
      "/api/v1/currencies/list": "content_items",
    };

    for (const [readPath, res] of Object.entries(readResourceMap)) {
      if (path === readPath) {
        if (!permDB.checkPermission(userPermissions, res, "read")) {
          return { response: json({
            success: false,
            error: `Forbidden: ${user.role} role cannot read ${res}`
          }, 403) };
        }
        break;
      }
    }
  }

  // ── WRITE permission gate (POST, PUT, DELETE) ──
  const writeMethods = ["POST", "PUT", "DELETE"];
  if (writeMethods.includes(request.method)) {
    const resourceMap = {
      "/api/v1/casino": "casinos",
      "/api/v1/casinos": "casinos",
      "/api/v1/review": "reviews",
      "/api/v1/reviews": "reviews",
      "/api/v1/news": "news",
      "/api/v1/page": "pages",
      "/api/v1/pages": "pages",
      "/api/v1/category": "categories",
      "/api/v1/categories": "categories",
      "/api/v1/country": "countries",
      "/api/v1/countries": "countries",
      "/api/v1/research-sources": "research_sources",
      "/api/v1/research-claims": "research_claims",
      "/api/v1/research-relations": "research_relations",
      "/api/v1/research-versions": "research",
      "/api/v1/research-datasets": "research_datasets",
      "/api/v1/research": "research",
      "/api/v1/payment-method": "payment_methods",
      "/api/v1/payment-methods": "payment_methods",
      "/api/v1/author": "authors",
      "/api/v1/authors": "authors",
      "/api/v1/component": "components",
      "/api/v1/components": "components",
      "/api/v1/seo-pages": "seo_pages",
      "/api/v1/seo": "seo",
      "/api/v1/settings": "settings",
      "/api/v1/geo-manager": null, // permissions are checked per item type inside the handler
      "/api/v1/ai-studio": null,   // permissions are checked per tool inside the handler
      "/api/v1/geo": "casinos",
      "/api/v1/media": "media",
      "/api/v1/nav": "nav",
      "/api/v1/platform-updates": "platform-updates",
      "/api/v1/ad-rules": "ad-rules",
      // Affiliate Partner & Program Management (System 1 -- handlers land in Phase 3E)
      "/api/v1/affiliate-partner": "affiliate_partners",
      "/api/v1/affiliate-partners": "affiliate_partners",
      "/api/v1/affiliate-program": "affiliate_programs",
      "/api/v1/affiliate-programs": "affiliate_programs",
      "/api/v1/affiliate-account": "affiliate_accounts",
      "/api/v1/affiliate-accounts": "affiliate_accounts",
      "/api/v1/commercial-term": "commercial_terms",
      "/api/v1/commercial-terms": "commercial_terms",
      // Postback Integrations (admin-only -- see migration 0033)
      "/api/v1/postback-config": "postback_configs",
      "/api/v1/postback-configs": "postback_configs",
      "/api/v1/imports": "import_batches",
      "/api/v1/import": "import_batches",
      "/api/v1/provider-adapter": "provider_adapter_configs",
      "/api/v1/provider-adapters": "provider_adapter_configs",
      // Offers (System 2) -- note: intentionally no delete endpoint, see migration 0021
      "/api/v1/offer": "offers",
      "/api/v1/offers": "offers",
      // Tracking Links (System 3) -- note: intentionally no delete endpoint, see migration 0022
      "/api/v1/tracking-link": "tracking_links",
      "/api/v1/tracking-links": "tracking_links",
      // Analytics / Reporting (Phase 5)
      "/api/v1/campaign": "campaigns",
      "/api/v1/campaigns": "campaigns",
      "/api/v1/analytics/conversion": "analytics_conversions",
      "/api/v1/analytics/aggregate-now": "analytics",
      "/api/v1/analytics/alerts/evaluate-now": "analytics",
      "/api/v1/analytics/reports/run-due-now": "analytics",
      "/api/v1/report": "reports",
      "/api/v1/reports": "reports",
      "/api/v1/analytics/alert": "analytics_alerts",
      "/api/v1/analytics/alert-rule": "analytics_alerts",
      // Generic content engine (Phase 8 — admin UI)
      "/api/v1/content-item": "content_items",
      "/api/v1/content-items": "content_items",
      "/api/v1/custom-type": "custom_content_types",
      "/api/v1/custom-types": "custom_content_types",
      "/api/v1/comparison": "comparisons",
      "/api/v1/comparisons": "comparisons",
      "/api/v1/generic-review": "reviews",
      "/api/v1/generic-reviews": "reviews",
      "/api/v1/content-landing-page": "content_landing_pages",
      "/api/v1/content-landing-pages": "content_landing_pages",
    };

    let resource = null;
    let action = "create";
    if (request.method === "DELETE") action = "delete";
    else if (request.method === "PUT") action = "update";

    for (const [prefix, res] of Object.entries(resourceMap)) {
      if (path.startsWith(prefix)) {
        resource = res;
        break;
      }
    }

    if (path.endsWith("/create") || path.endsWith("/save") || path.endsWith("/sync") || path.endsWith("/assign") || path.endsWith("/toggle") || path.endsWith("/reorder") || path.endsWith("/unassign") || path.endsWith("/bulk-assign") || path.endsWith("/update-assignment") || path.endsWith("/set-casinos") || path.endsWith("/set-payment-methods")) {
      action = "create";
    } else if (path.endsWith("/update")) {
      action = "update";
    } else if (path.endsWith("/delete")) {
      action = "delete";
    }

    if (resource && !permDB.checkPermission(userPermissions, resource, action)) {
      return { response: json({
        success: false,
        error: `Forbidden: ${user.role} role cannot ${action} ${resource}`
      }, 403) };
    }
  }

  return { userPermissions };
}
