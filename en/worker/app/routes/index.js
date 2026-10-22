// The route groups, tried in this order by app-worker.js. Every route type belongs to exactly one group.
import { handlePublicPages } from "./public-pages.js";
import { handleListings } from "./listings.js";
import { handleDashboardContent } from "./dashboard-content.js";
import { handleDashboardAdmin } from "./dashboard-admin.js";
import { handleServices } from "./services.js";
import { handleSitemaps } from "./sitemaps.js";
import { handleMisc } from "./misc.js";

export const ROUTE_GROUPS = [
  handlePublicPages,
  handleListings,
  handleDashboardContent,
  handleDashboardAdmin,
  handleServices,
  handleSitemaps,
  handleMisc,
];
