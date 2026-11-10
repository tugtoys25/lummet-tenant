// ============================================================
// SITE PROFILE: ownership tables (Phase 11 / T5, blueprint section 10)
// ============================================================
// registry.js says which capability owns each route type, dashboard screen, gated API prefix and sitemap file.
// Four things were not written down anywhere. This file records them so test/manifest-completeness.test.js can fail
// when something new appears without an owner:
//
//   API_AREAS               every admin API path that apiGate() does NOT refuse today, and who owns it.
//   ROW_SET_OWNERS          the row sets of the configuration document (menus, SEO, components, placements, layouts).
//   OTHER_SETTING_OWNERS    keys in the settings table that are not look-and-feel settings (those are in settings-groups.js).
//   KNOWN_UNUSED_ADMIN_TEMPLATES  admin templates that no controller renders.
//
// NOTHING at runtime imports this file. It changes no behaviour: it is a checked list, not a gate.
//
// Owner values: "core" (always on), "public" (works without sign-in, never gated), "system" (the configuration system's
// own state), or a capability id from registry.js ("casino", "casino.payments", "features.speed", ...).
//
// IMPORTANT, read before relying on a capability owner in API_AREAS: apiGate() only refuses the prefixes listed in
// FEATURES[*].api and MODULES[*].pages[*].api. An API area owned here by a module or page capability belongs to that
// module but is NOT refused when the module is switched off (its dashboard screens and public pages are). That is how
// the code behaves today. It is listed as UNGATED_MODULE_AREAS so the gap is visible, not hidden. When a prefix is
// moved into registry.js to be gated, delete its line here (the test refuses a path claimed in both places).

export const API_AREAS = {
  // ---- always on ----
  "/api/v1/auth": "core", "/api/v1/config": "core", "/api/v1/config-share": "core", "/api/v1/dashboard": "core",
  "/api/v1/permissions": "core", "/api/v1/settings": "core", "/api/v1/setup": "core", "/api/v1/site-profile": "core", "/api/v1/design-studio": "core", "/api/v1/studio-pro": "core",
  "/api/v1/media": "core", "/api/v1/nav": "core", "/api/v1/page": "core", "/api/v1/pages": "core", "/api/v1/seo": "core",
  "/api/v1/component": "core", "/api/v1/components": "core", "/api/v1/stats": "core", "/api/v1/currencies": "core",
  "/api/v1/user/permissions": "core",
  // ---- no sign-in needed ----
  "/api/v1/public": "public", "/api/v1/newsletter": "public",
  // ---- features whose prefix list in registry.js is empty (the screen is gated, the API is not) ----
  "/api/v1/speed": "features.speed",
  // ---- modules and pages: owned, not refused when off (see the note above) ----
  "/api/v1/casino": "casino", "/api/v1/casinos": "casino",
  "/api/v1/casino/payment-methods": "casino.payments", "/api/v1/casino/set-payment-methods": "casino.payments",
  "/api/v1/review": "reviews", "/api/v1/reviews": "reviews", // review-blocks moved to features.reviewSections (gated in registry.js)
  "/api/v1/comparison": "reviews.comparisons", "/api/v1/comparisons": "reviews.comparisons",
  "/api/v1/news": "news", "/api/v1/newsroom": "news",
  "/api/v1/platform-updates": "updates",
  "/api/v1/author": "authors", "/api/v1/authors": "authors",
  "/api/v1/categories": "taxonomy", "/api/v1/category": "taxonomy", "/api/v1/countries": "taxonomy", "/api/v1/country": "taxonomy", "/api/v1/seo-pages": "taxonomy",
  "/api/v1/research": "research", "/api/v1/research-claims": "research", "/api/v1/research-datasets": "research", "/api/v1/research-relations": "research",
  "/api/v1/research-review-queue": "research", "/api/v1/research-sources": "research", "/api/v1/research-versions": "research",
  "/api/v1/content-types-enabled": "content", "/api/v1/content-item": "content", "/api/v1/content-items": "content",
  "/api/v1/generic-review": "content", "/api/v1/generic-reviews": "content", "/api/v1/sports": "content.sportsbook",
  "/api/v1/custom-type": "content.custom", "/api/v1/custom-types": "content.custom",
  "/api/v1/content-landing-page": "content.landing", "/api/v1/content-landing-pages": "content.landing",
  // bookmarks, inquiries and submissions (user and admin side) moved to features.bookmarks / inquiries / submissions
  "/api/v1/user": "accounts", "/api/v1/admin/users": "accounts", "/api/v1/admin/user": "accounts",
  "/api/v1/affiliate-account": "partners", "/api/v1/affiliate-accounts": "partners", "/api/v1/affiliate-partner": "partners", "/api/v1/affiliate-partners": "partners",
  "/api/v1/affiliate-program": "partners", "/api/v1/affiliate-programs": "partners", "/api/v1/commercial-term": "partners", "/api/v1/commercial-terms": "partners",
  "/api/v1/postback-config": "partners", "/api/v1/postback-configs": "partners", "/api/v1/provider-adapter": "partners", "/api/v1/provider-adapters": "partners",
  "/api/v1/tracking-link": "partners", "/api/v1/tracking-links": "partners", "/api/v1/conversions": "partners", // /import and /imports moved to features.importTools
};

const matchesPrefix = (path, prefix) => path === prefix || path.startsWith(prefix + "/");

// Longest matching entry wins ("/api/v1/user/permissions" beats "/api/v1/user"). null when nothing claims the path.
export function areaForApiPath(path) {
  let best = null;
  for (const prefix of Object.keys(API_AREAS)) if (matchesPrefix(path, prefix) && (!best || prefix.length > best.length)) best = prefix;
  return best ? { prefix: best, owner: API_AREAS[best] } : null;
}

const NOT_A_CAPABILITY = new Set(["core", "public", "system"]);
export const isCapabilityOwner = (owner) => !NOT_A_CAPABILITY.has(owner);
// Areas that belong to a module or page but that apiGate() does not refuse when that module is off.
export const UNGATED_MODULE_AREAS = Object.entries(API_AREAS).filter(([, o]) => isCapabilityOwner(o) && !o.startsWith("features.")).map(([p]) => p);

// Row sets of the configuration document (see rows.js). All five are shared site structure, so they are core.
export const ROW_SET_OWNERS = { nav: "core", pages: "core", seo: "core", components: "core", placements: "core" };

// Keys in the settings table that no look-and-feel group edits. Each belongs to a screen or to the system itself.
export const OTHER_SETTING_OWNERS = {
  content_types_enabled: { owner: "content", why: "Older per-site switch for sportsbook, affiliate partners and custom types (Dashboard > Content Type Settings). Kept in step with presets by site-profile/content-sync.js." },
  email_notify_content_updates: { owner: "features.notifications", why: "Whether visitors are emailed about content updates." },
  email_weekly_digest_enabled: { owner: "features.subscriptions", why: "Whether the weekly digest is sent." },
  weekly_digest_last_attempt_at: { owner: "features.subscriptions", why: "Cron bookkeeping for the weekly digest. Never edited." },
  chat_quality_report_last_attempt_at: { owner: "features.ai", why: "Cron bookkeeping for the chat quality report. Never edited." },
  item_access_default_scope: { owner: "features.itemAccess", why: "Default scope for per-item access (stored in system_settings)." },
  site_profile: { owner: "system", why: "The site profile document itself." },
  site_setup_state: { owner: "system", why: "First-run setup state." },
  site_setup_source: { owner: "system", why: "How the site was set up." },
  site_setup_preset: { owner: "system", why: "Which preset the site was set up with." },
  site_setup_from: { owner: "system", why: "Which site the setup was copied from." },
  __lummet_site_access_state: { owner: "system", why: "Signed access state from the control plane (system_settings)." },
};

// Names that look like setting keys but are something else. Listed so the key scan can tell them apart.
export const NOT_SETTING_KEYS = {
  site_hero_button_new_tab: "A key inside a hero component's own settings JSON, not a row in the settings table (worker/component-hero.js).",
  site_hero_: "The prefix of the hero setting names, used to build component keys.",
  footer_casinos: "A menu location (nav_items.location), not a setting.", footer_company: "A menu location, not a setting.",
  footer_support: "A menu location, not a setting.", footer_legal: "A menu location, not a setting.",
  footer_compliance: "A form field assembled by settings-ux.js from compliance rows; stored through the footer fields.",
  site_access_gate_fail_open: "A log message name in site-access-gate.js.",
  site_setup: "A control plane route id.", site_config_export: "A control plane route id.", site_system: "A control plane route id.",
  site_access_state: "A control plane route id.",
};

// Admin templates (templates/pages/admin/*.html) that no controller renders. Listing them keeps a NEW unused screen
// visible. The two generic review editors were replaced by a redirect (renderDashboardGenericReviewCreate/Edit).
export const KNOWN_UNUSED_ADMIN_TEMPLATES = ["admin/generic-review-create.html", "admin/generic-review-edit.html"];
