// Super API routes: site setup (Phase 9). Each entry: [METHOD, path-pattern, handler, resource-name].
import * as h from "../handlers/site-setup.js";

export const SITE_SETUP_ROUTES = [
  ["GET", "/en/api/super/site-setup", h.handleGetSiteSetup, "site_setup"],
  ["POST", "/en/api/super/site-setup", h.handleProvisionSiteSetup, "site_setup"],
  ["GET", "/en/api/super/site-config-export", h.handleExportSiteConfig, "site_config_export"],
  ["GET", "/en/api/super/site-system", h.handleGetSiteSystem, "site_system"]
];
