// Order in which the admin API route groups are tried.
// Every route in the groups is an exact path match, so the order only decides
// how many cheap string comparisons run before a route is found.
import { route as casinos } from "./casinos.js";
import { route as contentItems } from "./content-items.js";
import { route as landingPages } from "./landing-pages.js";
import { route as customTypes } from "./custom-types.js";
import { route as comparisons } from "./comparisons.js";
import { route as genericReviews } from "./generic-reviews.js";
import { route as reviews } from "./reviews.js";
import { route as news } from "./news.js";
import { route as pages } from "./pages.js";
import { route as categories } from "./categories.js";
import { route as settings } from "./settings.js";
import { route as siteProfile } from "./site-profile.js";
import { route as siteProfileVersions } from "./site-profile-versions.js";
import { route as siteProfileTransfer } from "./site-profile-transfer.js";
import { route as stats } from "./stats.js";
import { route as platformUpdates } from "./platform-updates.js";
import { route as seoPages } from "./seo-pages.js";
import { route as geo } from "./geo.js";
import { route as ai } from "./ai.js";
import { route as paymentMethods } from "./payment-methods.js";
import { route as countries } from "./countries.js";
import { route as research } from "./research.js";
import { route as components } from "./components.js";
import { route as adRules } from "./ad-rules.js";
import { route as seo } from "./seo.js";
import { route as authors } from "./authors.js";
import { route as media } from "./media.js";
import { route as nav } from "./nav.js";
import { route as permissions } from "./permissions.js";
import { route as itemAccess } from "./item-access.js";
import { route as userDashboard } from "./user-dashboard.js";
import { route as admin } from "./admin.js";
import { route as affiliatePartners } from "./affiliate-partners.js";
import { route as affiliatePrograms } from "./affiliate-programs.js";
import { route as affiliateAccounts } from "./affiliate-accounts.js";
import { route as commercialTerms } from "./commercial-terms.js";
import { route as postbackConfigs } from "./postback-configs.js";
import { route as imports } from "./imports.js";
import { route as providerAdapters } from "./provider-adapters.js";
import { route as offers } from "./offers.js";
import { route as trackingLinks } from "./tracking-links.js";
import { route as analytics } from "./analytics.js";
import { route as analyticsAlerts } from "./analytics-alerts.js";
import { route as campaigns } from "./campaigns.js";
import { route as reports } from "./reports.js";
import { route as banners } from "./banners.js";
import { NOT_HANDLED } from "../helpers.js";
import { readLiveDocument, recordDirect, tablesReady } from "../../site-profile/versions.js";

// Saves made through the older screens (menu links, SEO records, page SEO, components) go straight to the live site.
// Wrapping them records each one as a numbered version with an audit entry, so history and rollback cover them too.
// Recording never changes the response and never throws.
const recorded = (group, action, applies) => async (ctx) => {
  if (ctx.request.method === "GET" || !applies(ctx.path)) return group(ctx);
  let before = null;
  try { if (await tablesReady(ctx.env)) before = await readLiveDocument(ctx.env); } catch { before = null; }
  const res = await group(ctx);
  if (before && res !== NOT_HANDLED && res && res.status < 400) await recordDirect(ctx.env, ctx.user, action, before);
  return res;
};

export const ROUTE_GROUPS = [
  casinos,
  contentItems,
  landingPages,
  customTypes,
  comparisons,
  genericReviews,
  reviews,
  news,
  recorded(pages, "direct.page", (p) => p === "/api/v1/page/update"),
  categories,
  siteProfileVersions,
  siteProfileTransfer,
  siteProfile,
  settings,
  stats,
  platformUpdates,
  seoPages,
  geo,
  ai,
  paymentMethods,
  countries,
  research,
  recorded(components, "direct.components", (p) => !/preview|pick-/.test(p)),
  adRules,
  recorded(seo, "direct.seo", () => true),
  authors,
  media,
  recorded(nav, "direct.nav", (p) => !p.includes("/geo/")),
  permissions,
  itemAccess,
  userDashboard,
  admin,
  affiliatePartners,
  affiliatePrograms,
  affiliateAccounts,
  commercialTerms,
  postbackConfigs,
  imports,
  providerAdapters,
  offers,
  trackingLinks,
  analytics,
  analyticsAlerts,
  campaigns,
  reports,
  banners,
];
