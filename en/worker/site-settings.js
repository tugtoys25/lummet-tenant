// ============================================================
// SITE SETTINGS
// Tenant-specific branding, icons, hero and footer compliance.
// Uses the existing `settings` database table.
// ============================================================

//import { getSetting } from "./database/settings.js";

// The code lives in site-settings/*.js (see docs/ARCHITECTURE_SITE_SETTINGS.md); this file keeps the public import path.
export { buildSiteManifest } from "./site-settings/manifest.js";
export { getSiteSettings } from "./site-settings/get-site-settings.js";
export { buildHomepageSectionsHtml } from "./site-settings/homepage-sections.js";
export { buildGaScript, buildGpwaSeal, buildGpwaScript } from "./site-settings/analytics.js";
export { buildComplianceHtml } from "./site-settings/compliance.js";
export { buildThemeCss } from "./site-settings/theme.js";
