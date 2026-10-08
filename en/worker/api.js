// =====================================================
// LEVELCASINO API v1
// Cloudflare Worker Controller Layer
// =====================================================
import * as authorsDB from "./database/authors.js";
import * as casinos from "./database/casinos.js";
import * as reviews from "./database/reviews.js";
import * as pages from "./database/pages.js";
import * as geo from "./database/geo.js";
import * as settings from "./database/settings.js";
import { sanitizeHeaderHeroInput } from "./header-hero.js";
import { cleanHeroSettingsJson, renderAdvancedHero } from "./component-hero.js";
import * as ai from "./database/ai.js";
import * as categories from "./database/categories.js";
import * as paymentMethods from "./database/payment-methods.js";
import * as news from "./database/news.js";
import * as platformUpdates from "./database/platform-updates.js";
import * as seoPages from "./database/seo-pages.js";
import * as adRulesDB from "./database/ad-rules.js";

import * as affiliatePartners from "./database/affiliate-partners.js";
import * as affiliatePrograms from "./database/affiliate-programs.js";
import * as affiliateAccounts from "./database/affiliate-accounts.js";
import * as commercialTerms from "./database/affiliate-commercial-terms.js";
import * as offersDB from "./database/offers.js";
import { resolveOfferForCasino, getCandidateOffers } from "./offers/selection.js";
import * as trackingLinksDB from "./database/tracking-links.js";
import { checkAndRecordLink } from "./tracking/health-check.js";
import { resolveRedirectTarget } from "./tracking/redirect.js";
import { logAudit } from "./database/audit.js";
import * as analyticsDB from "./database/analytics.js";
import * as reportsDB from "./database/reports.js";
import * as alertsDB from "./database/alerts.js";
import * as postbackConfigsDB from "./database/postback-configs.js";
import { handlePostbackRequest } from "./postback/handler.js";
import { ingestPostback } from "./postback/ingest.js";
import { normalizeConversionPayload, validateNormalized } from "./postback/field-mapping.js";
import * as importBatchesDB from "./database/import-batches.js";
import { parseCsv, parseJsonRows } from "./imports/parse.js";
import { importConversionReport } from "./imports/pipeline.js";
import * as providerAdaptersDB from "./database/provider-adapters.js";
import { syncProviderConfig } from "./adapters/sync.js";
import { listProviderKeys } from "./adapters/registry.js";
import * as cronHealthDB from "./database/cron-health.js";
import * as contentItemsDB from "./database/content-items.js";
import * as customTypesDB from "./database/custom-types.js";
import * as comparisonsDB from "./database/comparisons.js";
import * as landingPagesDB from "./database/content-landing-pages.js";
import * as genericReviewsDB from "./database/generic-reviews.js";
import { isReservedSlug } from "./reserved-slugs.js";
import { getContentTypeEnablement, updateContentTypeEnablement } from "./content-types.js";



import * as itemAccess from "./database/item-access.js";
import { handleNewsroomApi, beforeNewsUpdate, afterNewsUpdate, slugRedirectHook, searchReindexHook } from "./newsroom-api.js";
import { sanitizePublicNewsList } from "./newsroom-render.js";
import {
  handleGetUserItemAccess,
  handleSetUserItemAccess,
  handleDeleteUserItemAccess,
  handleAssignItem,
  handleUnassignItem,
  handleGetUserAssignments,
  handleGetItemAssignees,
  handleGetResources,
  handleGetDefaultScope,
  handleSetDefaultScope
} from "./database/item-access-api.js";


import { aiAssistant } from "./ai/assistant.js";

import {
  handleChat,
  handleChatStream,
  handleClearChat
} from "./ai/api.js";

import {
  login,
  logout,
  register,
  getCurrentUser,
  forgotPassword,
  resetPassword,
  changePassword,
  requireRole
}
from "./auth.js";
import { subscribeNewsletter } from "./newsletter.js";
import * as newsletterDB from "./database/newsletter.js";
import * as emailCampaigns from "./email-campaigns.js";
import * as campaignDB from "./database/email-campaigns.js";
import { notifyOnPublish } from "./content-notifications.js";
import { dashboardStatsAPI } from "./controllers.js";
import { aiEngine } from "./ai.js";
import * as componentsDB from "./database/components.js";
import * as reviewBlocksDB from "./database/review_blocks.js";
import * as seoMetaDB from "./database/seo_meta.js";
import * as mediaDB from "./database/media_library.js";
import * as navDB from "./database/nav.js";
import * as permDB from "./database/permissions.js";
import * as userDash from "./database/user_dashboard.js";
import * as adminTools from "./database/admin_tools.js";
import * as bannerDB from "./database/banners.js";
import { sanitizeUrl } from "./sanitize.js";
import { getCached, setCached, CACHE_KEYS, invalidateCasinos, invalidateNews, invalidateCountries, invalidateCategories, invalidateNav } from "./cache.js";
import {
  deleteCached
} from "./cache.js";
import {
    handleUpload,
    handleDelete,
    serveMedia,
} from './media-upload.js';
import {
    createFolder,
    getFolderById,
    getFolderBySlug,
    listFolders,
    listRootFolders,
    listChildFolders,
    updateFolder,
    deleteFolder,
    buildFolderTree,
    countMediaInFolder,
} from './database/media_folders.js';
import {
    createMediaItem,
    getMediaById,
    searchMedia,
    listMedia,
    updateMediaItem,
    deleteMediaItem,
    countMedia,
} from './database/media_library.js';



// =====================================================
// MAIN API HANDLER
// =====================================================

export async function handleAPI(
  request,
  env,
  path,
  user = null
) {

  // ----------------------------------
  // Require Login
  // ----------------------------------
  if(path === "/api/v1/auth/login"){
  return login(request,env);
}

if (path === "/api/v1/auth/register") {
  return register(request, env);
}

if(path === "/api/v1/auth/logout"){
  return logout(request,env);
}

if (path === "/api/v1/auth/forgot-password" && request.method === "POST") {
  return forgotPassword(request, env);
}

if (path === "/api/v1/auth/reset-password" && request.method === "POST") {
  return resetPassword(request, env);
}

if (path === "/api/v1/auth/change-password" && request.method === "POST") {
  return changePassword(request, env);
}

if (path === "/api/v1/newsletter/subscribe" && request.method === "POST") {
  return subscribeNewsletter(request, env);
}


if (path === "/api/v1/geo/check") {  
  const url = new URL(request.url);  
  const slug = url.searchParams.get("slug");  
  if (!slug) return failure("slug is required");  
  
  const country = request.cf?.country || null;  
    
  // Get ALL rules for this casino  
  const allRules = await env.DB.prepare(`  
    SELECT country_code, status FROM geo_rules  
    WHERE casino_slug = ?  
  `).bind(slug).all();  
    
  const rules = allRules.results || [];  
    
  // Check if this specific country has a rule  
  const countryRule = rules.find(r => r.country_code === country);  
    
  let status;  
  if (countryRule) {  
    status = countryRule.status;  
  } else if (rules.length === 0) {  
    // No rules at all → blocked  
    status = "blocked";  
  } else {  
    // No rule for this country — infer  
    const hasAllowed = rules.some(r => r.status === "allowed");  
    const hasBlocked = rules.some(r => r.status === "blocked");  
      
    if (hasAllowed && !hasBlocked) {  
      status = "blocked"; // Allowlist mode → blocked  
    } else if (hasBlocked && !hasAllowed) {  
      status = "allowed"; // Blocklist mode → allowed  
    } else {  
      status = "blocked"; // Mixed → blocked  
    }  
  }  
  
  const COUNTRY_NAMES = {RW:"Rwanda",US:"United States",CA:"Canada",GB:"United Kingdom",DE:"Germany",FR:"France",IT:"Italy",ES:"Spain",NL:"Netherlands",AU:"Australia",NZ:"New Zealand",JP:"Japan",CN:"China",IN:"India",BR:"Brazil",MX:"Mexico",ZA:"South Africa",NG:"Nigeria",KE:"Kenya",EG:"Egypt",SE:"Sweden",NO:"Norway",DK:"Denmark",FI:"Finland",PL:"Poland",PT:"Portugal",GR:"Greece",TR:"Turkey",RU:"Russia",UA:"Ukraine",AE:"United Arab Emirates",SA:"Saudi Arabia",QA:"Qatar",KR:"South Korea",TH:"Thailand",VN:"Vietnam",PH:"Philippines",ID:"Indonesia",MY:"Malaysia",SG:"Singapore",AR:"Argentina",CL:"Chile",CO:"Colombia",PE:"Peru",AT:"Austria",CH:"Switzerland",IE:"Ireland",BE:"Belgium",CZ:"Czech Republic",HU:"Hungary",RO:"Romania",BG:"Bulgaria",HR:"Croatia",MT:"Malta",CY:"Cyprus",LU:"Luxembourg",IS:"Iceland"};
  return json({
    status,
    country,
    countryName: COUNTRY_NAMES[country] || country,
    bonusOverride: countryRule?.bonus_override || null
  }); 
}  
  // One-time admin bootstrap — DELETE after first use
  if (path === "/api/v1/setup/admin" && request.method === "POST") {
    const body = await request.json();
    if (!body.email || !body.password) {
      return failure("Email and password required");
    }
    const existing = await env.DB.prepare(
      "SELECT COUNT(*) c FROM users WHERE role = 'admin'"
    ).first();
    if (existing.c > 0) {
      return failure("Admin already exists. Remove this endpoint for security.", 403);
    }
    const { hashPassword } = await import("./auth.js");
    const hash = await hashPassword(body.password);
    await env.DB.prepare(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')"
    ).bind(body.email, hash).run();
    return json({ success: true, message: "Admin created. Remove this endpoint now." });
  }

if (path === "/api/v1/public/reviews/list") {
  const result = await env.DB.prepare(`
    SELECT r.*, c.name as casino_name, c.logo as casino_logo
    FROM reviews r
    LEFT JOIN casinos c ON c.slug = r.casino_slug
    WHERE r.published = 1
    ORDER BY r.created_at DESC
  `).all();
  return json({ reviews: result.results });
}

if (path === "/api/v1/public/casino-reviews") {
  const url = new URL(request.url);
  const casinoSlug = url.searchParams.get("casino_slug");
  if (!casinoSlug) return json({ reviews: [] });
  const result = await env.DB.prepare(`
    SELECT * FROM reviews
    WHERE casino_slug = ? AND published = 1
    ORDER BY created_at DESC
  `).bind(casinoSlug).all();
  return json({ reviews: result.results });
}

if (path === "/api/v1/public/casinos/list") {
  let casinos = await getCached(env, CACHE_KEYS.PUBLIC_CASINOS);
  if (!casinos) {
    const result = await env.DB.prepare(`
      SELECT slug, name, logo, rating FROM casinos
      WHERE published = 1 AND status = 'published'
      ORDER BY featured DESC, sort_order ASC, rating DESC
    `).all();
    casinos = result.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_CASINOS, casinos);
  }
  return json({ casinos });
}

if (path === "/api/v1/public/news/list") {
  let newsList = await getCached(env, CACHE_KEYS.PUBLIC_NEWS);

  if (!newsList) {
    newsList = await news.getAllNews(env.DB);

    await setCached(
      env,
      CACHE_KEYS.PUBLIC_NEWS,
      newsList
    );
  }

  // Allow-list the public payload (drops created_by, ad_mode, ad_override_rules and any future private column).
  return json({ news: sanitizePublicNewsList(newsList) });
}
if (path === "/api/v1/public/newsbackup/list") {
  let news = await getCached(env, CACHE_KEYS.PUBLIC_NEWS);
  if (!news) {
    const result = await env.DB.prepare(`
      SELECT * FROM news
      WHERE published = 1
      ORDER BY created_at DESC
    `).all();
    news = result.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_NEWS, news);
  }
  return json({ news: sanitizePublicNewsList(news) });
}

if (path === "/api/v1/public/casinos/geo") {
  const country = request.cf?.country || null;

  // Try cached casinos + geo rules
  let casinoList = await getCached(env, CACHE_KEYS.PUBLIC_CASINOS);
  let allRules = await getCached(env, CACHE_KEYS.PUBLIC_GEO_RULES);

  if (!casinoList) {
    const result = await env.DB.prepare(`
      SELECT slug, name, logo, rating, bonus_title, bonus_value, website_url
      FROM casinos
      WHERE published = 1 AND status = 'published'
      ORDER BY featured DESC, sort_order ASC, rating DESC
    `).all();
    casinoList = result.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_CASINOS, casinoList);
  }

  if (!allRules) {
    const rulesResult = await env.DB.prepare(`
      SELECT casino_slug, country_code, status FROM geo_rules
    `).all();
    allRules = rulesResult.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_GEO_RULES, allRules);
  }

  if (casinoList.length === 0) return json({ casinos: [], country });

  // Group rules by casino slug
  const rulesByCasino = {};
  for (const row of allRules) {
    if (!rulesByCasino[row.casino_slug]) rulesByCasino[row.casino_slug] = [];
    rulesByCasino[row.casino_slug].push(row);
  }

  // Compute geo status per casino
  const geoCasinos = casinoList.map(casino => {
    const rules = rulesByCasino[casino.slug] || [];
    let geoStatus = "blocked";

    if (rules.length === 0) {
      geoStatus = "blocked";
    } else {
      const countryRule = rules.find(r => r.country_code === country);
      if (countryRule) {
        geoStatus = countryRule.status;
      } else {
        const hasAllowed = rules.some(r => r.status === "allowed");
        const hasBlocked = rules.some(r => r.status === "blocked");
        if (hasAllowed && !hasBlocked) geoStatus = "blocked";
        else if (hasBlocked && !hasAllowed) geoStatus = "allowed";
        else geoStatus = "blocked";
      }
    }

    return { ...casino, geo_status: geoStatus };
  });

  // Sort: available first (by rating desc), then unavailable (by rating desc)
  geoCasinos.sort((a, b) => {
    const aAvail = a.geo_status === "allowed" ? 1 : 0;
    const bAvail = b.geo_status === "allowed" ? 1 : 0;
    if (aAvail !== bAvail) return bAvail - aAvail;
    return (b.rating || 0) - (a.rating || 0);
  });

  return json({ casinos: geoCasinos, country });
}



if (path === "/api/v1/public/reviews/geo") {
  const country = request.cf?.country || null;
  const result = await env.DB.prepare(`
    SELECT r.*, c.name as casino_name, c.logo as casino_logo, c.slug as casino_slug
    FROM reviews r
    LEFT JOIN casinos c ON c.slug = r.casino_slug
    WHERE r.published = 1
    ORDER BY r.created_at DESC
  `).all();

  const reviews = result.results || [];
  if (reviews.length === 0) return json({ reviews: [] });

  // Get geo rules for all casinos referenced by reviews
  const casinoSlugs = [...new Set(reviews.filter(r => r.casino_slug).map(r => r.casino_slug))];
  if (casinoSlugs.length === 0) return json({ reviews, country });

  const placeholders = casinoSlugs.map(() => '?').join(',');
  const rulesResult = await env.DB.prepare(`
    SELECT casino_slug, country_code, status FROM geo_rules
    WHERE casino_slug IN (${placeholders})
  `).bind(...casinoSlugs).all();

  const rulesByCasino = {};
  for (const row of (rulesResult.results || [])) {
    if (!rulesByCasino[row.casino_slug]) rulesByCasino[row.casino_slug] = [];
    rulesByCasino[row.casino_slug].push(row);
  }

  const geoReviews = reviews.map(review => {
    if (!review.casino_slug) return { ...review, geo_status: "unknown" };
    const rules = rulesByCasino[review.casino_slug] || [];
    let geoStatus = "blocked";

    if (rules.length === 0) {
      geoStatus = "blocked";
    } else {
      const countryRule = rules.find(r => r.country_code === country);
      if (countryRule) {
        geoStatus = countryRule.status;
      } else {
        const hasAllowed = rules.some(r => r.status === "allowed");
        const hasBlocked = rules.some(r => r.status === "blocked");
        if (hasAllowed && !hasBlocked) geoStatus = "blocked";
        else if (hasBlocked && !hasAllowed) geoStatus = "allowed";
        else geoStatus = "blocked";
      }
    }

    return { ...review, geo_status: geoStatus };
  });
    // Geo-rank: available first (by rating desc), then unavailable (by rating desc)
  geoReviews.sort((a, b) => {
    const aAvail = a.geo_status === "allowed" ? 1 : 0;
    const bAvail = b.geo_status === "allowed" ? 1 : 0;
    if (aAvail !== bAvail) return bAvail - aAvail;
    return (b.rating || 0) - (a.rating || 0);
  });

  return json({ reviews: geoReviews, country });
}

if (path === "/api/v1/public/categories/list") {
  let categories = await getCached(env, CACHE_KEYS.PUBLIC_CATEGORIES);
  if (!categories) {
    const result = await env.DB.prepare(`
      SELECT * FROM categories ORDER BY name
    `).all();
    categories = result.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_CATEGORIES, categories, 600);
  }
  return json({ categories });
}

if (path === "/api/v1/public/countries/list") {
  let countries = await getCached(env, CACHE_KEYS.PUBLIC_COUNTRIES);
  if (!countries) {
    const result = await env.DB.prepare(`
      SELECT * FROM countries ORDER BY name
    `).all();
    countries = result.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_COUNTRIES, countries, 600);
  }
  return json({ countries });
}

// ── Universal S2S conversion postback (brief §4-6) ──
// Deliberately unauthenticated at the session-user level, same as the
// /api/v1/public/* routes above -- this endpoint authenticates each
// request itself, per postback_configs row, in
// worker/postback/handler.js (HMAC/shared-secret/API-key/signed-query,
// never a login cookie). This is the endpoint the comment further
// below (search "an unauthenticated public postback endpoint") used to
// flag as not yet built.
if (path.startsWith("/api/v1/conversions/postback/") && (request.method === "POST" || request.method === "GET")) {
  const token = path.slice("/api/v1/conversions/postback/".length);
  if (!token) return failure("Not found", 404);
  return handlePostbackRequest(request, env, token);
}


  // Lummet AI's public endpoints are intentionally reachable while
  // logged out -- that's how the free-tier (first 3 messages) flow
  // works before registration/login is required. Gating past that
  // point happens inside worker/ai/assistant.js, not here.
  const PUBLIC_AI_PATHS = [
    "/api/v1/ai/chat",
    "/api/v1/ai/chat/stream",
    "/api/v1/ai/chat/clear"
  ];

  if (!user && !PUBLIC_AI_PATHS.includes(path)) {
    return failure("Unauthorized", 401);
  }


    const userPermissions = await permDB.getPermissionsForUser(env.DB, user);

  // ── READ permission gate (GET requests) ──
  // Previously unreachable because it was nested inside writeMethods.
    // ── READ permission gate (GET requests) ──
  if (request.method === "GET") {
    const readResourceMap = {
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
          return json({
            success: false,
            error: `Forbidden: ${user.role} role cannot read ${res}`
          }, 403);
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
      return json({
        success: false,
        error: `Forbidden: ${user.role} role cannot ${action} ${resource}`
      }, 403);
    }
  }


if (path === "/api/v1/dashboard") {
  return dashboardStatsAPI(request, env);
}


if (path === "/api/v1/old/geo/check") {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return failure("slug is required");

    const country = request.cf?.country || null;
    const rule = await geo.getGeoRule(env.DB, slug, country);

    if (rule) {
      return json({
        status: rule.status,
        country,
        bonusOverride: rule.bonus_override || null
      });
    }

    return json({
      status: "allowed",
      country,
      bonusOverride: null
    });
  }

  try {

    // ==================================
    // CASINOS
    // ==================================

    if (
      path === "/api/v1/casino/create" &&
      request.method === "POST"
    ) {
      return createCasino(request, env, user);
    }

    if (
      path === "/api/v1/casino/update" &&
      request.method === "POST"
    ) {
      return updateCasino(request, env, user);
    }

    if (
      path === "/api/v1/casino/delete" &&
      request.method === "POST"
    ) {
      return deleteCasino(request, env, user);
    }

if (path === "/api/v1/casinos/list") {
  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'casinos', 'read', ''
  );
  const whereClause = condition ? `WHERE ${condition}` : '';

  const casinos = await env.DB.prepare(
    `SELECT id, slug, name, rating, featured, sort_order, status, published
     FROM casinos ${whereClause}
     ORDER BY featured DESC, sort_order ASC, rating DESC`
  ).bind(...params).all();

  return json({ casinos: casinos.results });
}


if (path === "/api/v1/casino/get") {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");

  if (!slug) return failure("slug is required");

  const casino = await env.DB.prepare(`
    SELECT *
    FROM casinos
    WHERE slug = ?
    LIMIT 1
  `).bind(slug).first();

  if (!casino) return failure("Casino not found",404);
  // Item-level access check — prevents IDOR
  const canAccess = await itemAccess.canAccessItem(env.DB, user, 'casinos', 'read', casino);
  if (!canAccess) return failure("Casino not found", 404);

  const categoryRows = await env.DB.prepare(`
    SELECT category_id
    FROM casino_categories
    WHERE casino_id = ?
  `).bind(casino.id).all();

  casino.category_ids = (categoryRows.results || []).map(r => r.category_id);

  return json({
    success: true,
    casino
  });
}

// =====================================================
// GENERIC CONTENT ENGINE (Phase 8 — admin UI, + this pass's gap
// completion/hardening)
// Covers content_items (sportsbook/affiliate_partner/custom),
// custom_content_types, and comparisons.
//
// Item-level (user_item_access) scoping IS wired in for content_items
// and comparisons on the single-item get/update/delete endpoints (via
// itemAccess.canAccessItem, see item-access.js) -- but the *list*
// endpoints below were still unscoped (every item of a type, regardless
// of who owns/is-assigned it), so an editor on 'own'/'assigned'/'none'
// scope could still see items in the list they couldn't open. Now
// filtered the same way reviews/list, news/list etc. do it elsewhere in
// this file, via itemAccess.getAccessibleWhereClause(). custom_types has
// no item-level scoping by design (see item-access.js's comment: it's a
// type *definition*, admin-only, not per-item content).
// =====================================================

if (path === "/api/v1/content-items/list" && request.method === "GET") {
  const url = new URL(request.url);
  const contentType = url.searchParams.get("content_type");
  if (!contentType) return failure("content_type is required");
  const search = url.searchParams.get("search") || null;
  const status = url.searchParams.get("status") || null;
  const { condition, params } = await itemAccess.getAccessibleWhereClause(env.DB, user, "content_items", "read");
  // page/per_page (audit #15): omitted -> unbounded, unchanged behavior
  // for any existing caller (e.g. buildContentItemCards() call sites).
  const page = url.searchParams.has("page") ? Math.max(1, parseInt(url.searchParams.get("page")) || 1) : null;
  const perPage = Math.min(200, Math.max(1, parseInt(url.searchParams.get("per_page")) || 25));
  const opts = { search, status, extraCondition: condition || null, extraParams: params };
  if (page != null) { opts.limit = perPage; opts.offset = (page - 1) * perPage; }
  const result = await contentItemsDB.getAllContentItems(env.DB, contentType, opts);
  if (page != null) return json({ success: true, items: result.items, total: result.total, page, per_page: perPage });
  return json({ success: true, items: result });
}

if (path === "/api/v1/content-item/get" && request.method === "GET") {
  const url = new URL(request.url);
  const contentType = url.searchParams.get("content_type");
  const slug = url.searchParams.get("slug");
  if (!contentType || !slug) return failure("content_type and slug are required");
  const item = await contentItemsDB.getContentItem(env.DB, contentType, slug);
  if (!item) return failure("Content item not found", 404);
  const canAccess = await itemAccess.canAccessItem(env.DB, user, "content_items", "read", item);
  if (!canAccess) return failure("Content item not found", 404);
  const [sportIds, currencyIds, paymentMethodIds] = contentType === "sportsbook"
    ? await Promise.all([
        contentItemsDB.getContentItemSports(env.DB, contentType, item.id),
        contentItemsDB.getContentItemCurrencies(env.DB, contentType, item.id),
        contentItemsDB.getContentItemPaymentMethods(env.DB, contentType, item.id),
      ])
    : [[], [], []];
  // Categories and GEO rules apply to every generic content type (the
  // content_categories / content_geo tables from migration 0051 are
  // type-agnostic), unlike sports/currencies/payment methods above.
  const [categoryIds, geoRules] = await Promise.all([
    contentItemsDB.getContentItemCategories(env.DB, contentType, item.id),
    contentItemsDB.getContentItemGeoRules(env.DB, contentType, item.id),
  ]);
  return json({
    success: true, item,
    sport_ids: sportIds.map(s => s.id), currency_ids: currencyIds.map(c => c.id), payment_method_ids: paymentMethodIds.map(p => p.id),
    category_ids: categoryIds,
    geo_rules: geoRules.map(r => ({ country_code: r.country_code, status: r.status })),
  });
}

if (path === "/api/v1/content-item/search" && request.method === "GET") {
  // Backs the comparison builder's item picker (replaces raw numeric ID
  // entry). Casino is included here too, even though it lives in a
  // separate table, so callers get one search endpoint regardless of
  // content_type rather than needing to know which table backs which type.
  const url = new URL(request.url);
  const contentType = url.searchParams.get("content_type");
  const q = (url.searchParams.get("q") || "").trim();
  // `id` (optional): exact-id lookup instead of a text search -- used
  // by the comparison edit screen to resolve a human-readable label
  // for an already-selected item (comparison_items only stores
  // item_content_type/item_id, no name), rather than making the admin
  // re-search for something they already picked.
  const idParam = url.searchParams.get("id");
  const id = idParam ? parseInt(idParam) : null;
  if (!contentType) return failure("content_type is required");
  if (contentType === "casino") {
    let result;
    if (id) {
      result = await env.DB.prepare(`SELECT id, 'casino' AS content_type, slug, name, status, published FROM casinos WHERE id = ? LIMIT 1`).bind(id).all();
    } else if (q) {
      const like = `%${q.toLowerCase()}%`;
      result = await env.DB.prepare(`SELECT id, 'casino' AS content_type, slug, name, status, published FROM casinos WHERE LOWER(name) LIKE ? OR LOWER(slug) LIKE ? ORDER BY name ASC LIMIT 20`).bind(like, like).all();
    } else {
      result = await env.DB.prepare(`SELECT id, 'casino' AS content_type, slug, name, status, published FROM casinos ORDER BY name ASC LIMIT 20`).all();
    }
    return json({ success: true, items: result.results || [] });
  }
  if (!["sportsbook", "affiliate_partner", "custom"].includes(contentType)) {
    return failure("content_type must be casino, sportsbook, affiliate_partner, or custom");
  }
  const items = id
    ? [await contentItemsDB.getContentItemById(env.DB, contentType, id)].filter(Boolean)
    : await contentItemsDB.searchContentItems(env.DB, { contentType, search: q, limit: 20 });
  return json({ success: true, items });
}

if (path === "/api/v1/sports/list" && request.method === "GET") {
  const result = await env.DB.prepare(`SELECT * FROM sports ORDER BY sort_order ASC, name ASC`).all();
  return json({ success: true, sports: result.results || [] });
}

if (path === "/api/v1/currencies/list" && request.method === "GET") {
  const result = await env.DB.prepare(`SELECT * FROM currencies ORDER BY name ASC`).all();
  return json({ success: true, currencies: result.results || [] });
}

// =====================================================
// CONTENT LANDING PAGES (audit "SEO landing pages for generic types").
// Deliberately smaller than the casino seo_pages system (migration
// 0019): one item grid per page, manual or auto selection, no
// country x category matrix, no section builder. See migration 0061.
// =====================================================

if (path === "/api/v1/content-landing-pages/list" && request.method === "GET") {
  const url = new URL(request.url);
  const contentType = url.searchParams.get("content_type") || null;
  const pages = await landingPagesDB.getAllLandingPages(env.DB, { contentType });
  return json({ success: true, pages });
}

if (path === "/api/v1/content-landing-page/get" && request.method === "GET") {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return failure("slug is required");
  const page = await landingPagesDB.getLandingPage(env.DB, slug);
  if (!page) return failure("Landing page not found", 404);
  const itemIds = await landingPagesDB.getLandingPageItemIds(env.DB, page.id);
  return json({ success: true, page, item_ids: itemIds });
}

if (path === "/api/v1/content-landing-page/create" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["content_type", "slug", "title"]);
  if (!["sportsbook", "affiliate_partner", "custom"].includes(body.content_type)) {
    return failure("content_type must be sportsbook, affiliate_partner, or custom");
  }
  if (body.content_type === "custom" && !body.custom_type_slug) {
    return failure("custom_type_slug is required when content_type is custom");
  }
  if (body.item_mode && !["manual", "auto"].includes(body.item_mode)) {
    return failure('item_mode must be "manual" or "auto"');
  }
  const page = await landingPagesDB.createLandingPage(env.DB, {
    contentType: body.content_type, customTypeSlug: body.custom_type_slug || null,
    slug: body.slug, title: body.title, description: body.description || null,
    itemMode: body.item_mode || "manual", autoLimit: parseInt(body.auto_limit) || 10,
    status: body.status || "draft",
    seoTitle: body.seo_title || null, seoDescription: body.seo_description || null, seoKeywords: body.seo_keywords || null,
    authorId: body.author_id || null, createdBy: user.user_id,
  });
  if (page.item_mode === "manual" && Array.isArray(body.item_ids)) {
    await landingPagesDB.setLandingPageItems(env.DB, page.id, body.item_ids.map(Number).filter(Number.isInteger));
  }
  await logAudit(env.DB, { userId: user.user_id, action: "create", entityType: "content_landing_page", entityId: page.id, metadata: { slug: body.slug, content_type: body.content_type } });
  return success({ page });
}

if (path === "/api/v1/content-landing-page/update" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["slug"]);
  const existing = await landingPagesDB.getLandingPage(env.DB, body.slug);
  if (!existing) return failure("Landing page not found", 404);
  if (body.item_mode && !["manual", "auto"].includes(body.item_mode)) {
    return failure('item_mode must be "manual" or "auto"');
  }
  const fields = {};
  for (const [bodyKey, fieldKey] of [["title", "title"], ["description", "description"], ["item_mode", "itemMode"], ["status", "status"], ["seo_title", "seoTitle"], ["seo_description", "seoDescription"], ["seo_keywords", "seoKeywords"]]) {
    if (body[bodyKey] !== undefined) fields[fieldKey] = body[bodyKey];
  }
  if (body.auto_limit !== undefined) fields.autoLimit = parseInt(body.auto_limit) || 10;
  const page = await landingPagesDB.updateLandingPage(env.DB, body.slug, fields);
  if (Array.isArray(body.item_ids)) await landingPagesDB.setLandingPageItems(env.DB, page.id, body.item_ids.map(Number).filter(Number.isInteger));
  await logAudit(env.DB, { userId: user.user_id, action: "update", entityType: "content_landing_page", entityId: page.id, metadata: { slug: body.slug, status: page.status } });
  return success({ page });
}

if (path === "/api/v1/content-landing-page/delete" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["slug"]);
  const existing = await landingPagesDB.deleteLandingPage(env.DB, body.slug);
  if (!existing) return failure("Landing page not found", 404);
  await logAudit(env.DB, { userId: user.user_id, action: "delete", entityType: "content_landing_page", entityId: existing.id, metadata: { slug: body.slug, title: existing.title } });
  return success();
}

if (path === "/api/v1/content-item/create" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["content_type", "slug", "name"]);
  if (!["sportsbook", "affiliate_partner", "custom"].includes(body.content_type)) {
    return failure("content_type must be sportsbook, affiliate_partner, or custom");
  }
  if (body.content_type === "custom" && !body.custom_type_slug) {
    return failure("custom_type_slug is required when content_type is custom");
  }
  const geoCheck = await normalizeGeoRules(env.DB, body.geo_rules);
  if (geoCheck.error) return failure(geoCheck.error);
  const mediaCheck = normalizeMediaAndTrackingFields(body);
  if (mediaCheck.error) return failure(mediaCheck.error);
  const item = await contentItemsDB.createContentItem(env.DB, body.content_type, {
    slug: body.slug, name: body.name, title: body.title || null, description: body.description || null,
    website: body.website || null, rating: parseFloat(body.rating) || 0,
    license: body.license || null, licenseCountry: body.license_country || null,
    liveBetting: !!body.live_betting, preMatch: !!body.pre_match, cashout: !!body.cashout, mobileApp: !!body.mobile_app,
    linkedAffiliatePartnerId: body.linked_affiliate_partner_id || null,
    featured: !!body.featured, sortOrder: parseInt(body.sort_order) || 0,
    status: body.status || "draft", published: !!body.published,
    seoTitle: body.seo_title || null, seoDescription: body.seo_description || null, seoKeywords: body.seo_keywords || null,
    authorId: body.author_id || null, createdBy: user.user_id, customTypeSlug: body.custom_type_slug || null,
    ...mediaCheck.fields,
  });
  if (body.content_type === "sportsbook") {
    if (Array.isArray(body.sport_ids)) await contentItemsDB.setContentItemSports(env.DB, body.content_type, item.id, body.sport_ids);
    if (Array.isArray(body.currency_ids)) await contentItemsDB.setContentItemCurrencies(env.DB, body.content_type, item.id, body.currency_ids);
    if (Array.isArray(body.payment_method_ids)) await contentItemsDB.setContentItemPaymentMethods(env.DB, body.content_type, item.id, body.payment_method_ids);
  }
  if (body.content_type === "custom" && body.custom_field_values && typeof body.custom_field_values === "object") {
    await contentItemsDB.setContentItemCustomFieldValues(env.DB, item.id, body.custom_field_values);
  }
  if (Array.isArray(body.category_ids)) await contentItemsDB.setContentItemCategories(env.DB, body.content_type, item.id, body.category_ids.map(Number).filter(Number.isInteger));
  if (geoCheck.rules) await contentItemsDB.setContentItemGeoRules(env.DB, body.content_type, item.id, geoCheck.rules);
  await logAudit(env.DB, { userId: user.user_id, action: "create", entityType: "content_item", entityId: item.id, metadata: { content_type: body.content_type, slug: body.slug, name: body.name } });
  return success({ item });
}

if (path === "/api/v1/content-item/delete" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["content_type", "slug"]);
  const existing = await contentItemsDB.getContentItem(env.DB, body.content_type, body.slug);
  if (!existing) return failure("Content item not found", 404);
  const canAccess = await itemAccess.canAccessItem(env.DB, user, "content_items", "delete", existing);
  if (!canAccess) return failure("Content item not found", 404);
  await env.DB.prepare(`DELETE FROM content_items WHERE content_type = ? AND slug = ?`).bind(body.content_type, body.slug).run();
  // The normalized relationship tables key on (content_type, content_id)
  // with no FK to content_items (one polymorphic table serves every
  // type), so they don't cascade -- clean them up explicitly rather than
  // leaving orphaned rows behind.
  for (const table of ["content_sports", "content_currencies", "content_payment_methods", "content_categories", "content_geo"]) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE content_type = ? AND content_id = ?`).bind(body.content_type, existing.id).run();
  }
  await logAudit(env.DB, { userId: user.user_id, action: "delete", entityType: "content_item", entityId: existing.id, metadata: { content_type: body.content_type, slug: body.slug, name: existing.name } });
  return success();
}

if (path === "/api/v1/content-item/update" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["content_type", "slug"]);
  const existing = await contentItemsDB.getContentItem(env.DB, body.content_type, body.slug);
  if (!existing) return failure("Content item not found", 404);
  // Item-level access check (independent of, and additional to, the
  // role/resource permission gate already run above) -- prevents an
  // editor with scope 'own'/'assigned'/'none' from editing an item
  // outside what they're allowed to touch. No-op (always allowed) for
  // admins and for any editor still on the system default 'all'
  // scope, so this is backward-compatible until an admin explicitly
  // narrows a specific editor's scope for this resource.
  const canAccess = await itemAccess.canAccessItem(env.DB, user, "content_items", "update", existing);
  if (!canAccess) return failure("Content item not found", 404); // 404, not 403 -- same IDOR-safe convention the existing casino endpoints use
  if (body.slug_new && body.slug_new !== body.slug) {
    return failure("Changing the slug is not supported yet -- create a new item instead.");
  }
  // Build the update payload with ONLY the keys the client actually
  // sent -- updateContentItem() uses hasOwnProperty to decide what to
  // touch, and an explicit `key: undefined` still satisfies
  // hasOwnProperty, so keys must be genuinely OMITTED here, not set
  // to undefined, or an unsent field would get wiped to NULL/0.
  const fields = {};
  const strFields = { name: "name", title: "title", description: "description", website: "website",
    license: "license", license_country: "licenseCountry", status: "status",
    seo_title: "seoTitle", seo_description: "seoDescription", seo_keywords: "seoKeywords" };
  for (const [bodyKey, fieldKey] of Object.entries(strFields)) {
    if (body[bodyKey] !== undefined) fields[fieldKey] = body[bodyKey];
  }
  if (body.rating !== undefined) fields.rating = parseFloat(body.rating) || 0;
  if (body.sort_order !== undefined) fields.sortOrder = parseInt(body.sort_order) || 0;
  if (body.linked_affiliate_partner_id !== undefined) fields.linkedAffiliatePartnerId = body.linked_affiliate_partner_id || null;
  for (const [bodyKey, fieldKey] of Object.entries({ live_betting: "liveBetting", pre_match: "preMatch", cashout: "cashout", mobile_app: "mobileApp", featured: "featured", published: "published" })) {
    if (body[bodyKey] !== undefined) fields[fieldKey] = !!body[bodyKey];
  }

  const geoCheck = await normalizeGeoRules(env.DB, body.geo_rules);
  if (geoCheck.error) return failure(geoCheck.error);
  const mediaCheck = normalizeMediaAndTrackingFields(body);
  if (mediaCheck.error) return failure(mediaCheck.error);
  Object.assign(fields, mediaCheck.fields);
  const item = await contentItemsDB.updateContentItem(env.DB, body.content_type, body.slug, fields);
  if (Array.isArray(body.category_ids)) await contentItemsDB.setContentItemCategories(env.DB, body.content_type, item.id, body.category_ids.map(Number).filter(Number.isInteger));
  if (geoCheck.rules) await contentItemsDB.setContentItemGeoRules(env.DB, body.content_type, item.id, geoCheck.rules);
  if (body.content_type === "sportsbook") {
    if (Array.isArray(body.sport_ids)) await contentItemsDB.setContentItemSports(env.DB, body.content_type, item.id, body.sport_ids);
    if (Array.isArray(body.currency_ids)) await contentItemsDB.setContentItemCurrencies(env.DB, body.content_type, item.id, body.currency_ids);
    if (Array.isArray(body.payment_method_ids)) await contentItemsDB.setContentItemPaymentMethods(env.DB, body.content_type, item.id, body.payment_method_ids);
  }
  if (body.content_type === "custom" && body.custom_field_values && typeof body.custom_field_values === "object") {
    await contentItemsDB.setContentItemCustomFieldValues(env.DB, item.id, body.custom_field_values);
  }
  await logAudit(env.DB, { userId: user.user_id, action: "update", entityType: "content_item", entityId: item.id, metadata: { content_type: body.content_type, slug: body.slug } });
  return success({ item });
}

if (path === "/api/v1/content-item/custom-field-values" && request.method === "GET") {
  const url = new URL(request.url);
  const contentType = url.searchParams.get("content_type");
  const slug = url.searchParams.get("slug");
  if (!contentType || !slug) return failure("content_type and slug are required");
  const item = await contentItemsDB.getContentItem(env.DB, contentType, slug);
  if (!item) return failure("Content item not found", 404);
  const [definitions, values] = await Promise.all([
    item.custom_type_slug ? customTypesDB.getCustomFieldDefinitions(env.DB, item.custom_type_slug) : Promise.resolve([]),
    customTypesDB.getCustomFieldValues(env.DB, item.id),
  ]);
  return json({ success: true, definitions, values });
}

if (path === "/api/v1/custom-types/list" && request.method === "GET") {
  const url = new URL(request.url);
  const page = url.searchParams.has("page") ? Math.max(1, parseInt(url.searchParams.get("page")) || 1) : null;
  const perPage = Math.min(200, Math.max(1, parseInt(url.searchParams.get("per_page")) || 25));
  if (page == null) {
    const types = await customTypesDB.getAllCustomContentTypes(env.DB);
    return json({ success: true, types });
  }
  const result = await customTypesDB.getAllCustomContentTypes(env.DB, { limit: perPage, offset: (page - 1) * perPage });
  return json({ success: true, types: result.items, total: result.total, page, per_page: perPage });
}

if (path === "/api/v1/custom-type/create" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["slug", "label", "plural_label"]);
  try {
    const type = await customTypesDB.createCustomContentType(env.DB, {
      slug: body.slug, label: body.label, pluralLabel: body.plural_label, icon: body.icon || null,
      reviewEnabled: body.review_enabled !== false, comparisonEnabled: body.comparison_enabled !== false,
    }, isReservedSlug);
    if (Array.isArray(body.fields)) {
      for (let i = 0; i < body.fields.length; i++) {
        const f = body.fields[i];
        await env.DB.prepare(`
          INSERT INTO custom_field_definitions (custom_type_slug, field_key, label, field_type, options_json, required, display_order)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(type.slug, f.field_key, f.label, f.field_type, f.options_json || null, f.required ? 1 : 0, i * 10).run();
      }
    }
    await logAudit(env.DB, { userId: user.user_id, action: "create", entityType: "custom_content_type", entityId: type.id, metadata: { slug: body.slug, label: body.label } });
    return success({ type });
  } catch (e) {
    return failure(e.message, 400);
  }
}

if (path === "/api/v1/custom-type/fields" && request.method === "GET") {
  const url = new URL(request.url);
  const typeSlug = url.searchParams.get("type_slug");
  if (!typeSlug) return failure("type_slug is required");
  const fields = await customTypesDB.getCustomFieldDefinitions(env.DB, typeSlug);
  return json({ success: true, fields });
}

if (path === "/api/v1/custom-type/update" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["slug"]);
  const existing = await customTypesDB.getCustomContentType(env.DB, body.slug);
  if (!existing) return failure("Custom content type not found", 404);
  const fields = {};
  if (body.label !== undefined) fields.label = body.label;
  if (body.plural_label !== undefined) fields.pluralLabel = body.plural_label;
  if (body.icon !== undefined) fields.icon = body.icon;
  if (body.review_enabled !== undefined) fields.reviewEnabled = !!body.review_enabled;
  if (body.comparison_enabled !== undefined) fields.comparisonEnabled = !!body.comparison_enabled;
  const type = await customTypesDB.updateCustomContentType(env.DB, body.slug, fields);
  let addedFields = [];
  if (Array.isArray(body.new_fields) && body.new_fields.length) {
    addedFields = await customTypesDB.addCustomFieldDefinitions(env.DB, body.slug, body.new_fields);
  }
  // `fields` (the full array, as opposed to `new_fields` above) does a
  // full replace-and-reorder -- lets the edit screen actually remove or
  // reorder an existing field, which addCustomFieldDefinitions() can't
  // do (it's append-only by design). Mutually exclusive with
  // `new_fields` in one call; a client sends one or the other.
  let replacedFields = null;
  if (Array.isArray(body.fields)) {
    replacedFields = await customTypesDB.updateCustomFieldDefinitions(env.DB, body.slug, body.fields.map((f, i) => ({
      field_key: f.field_key, label: f.label, field_type: f.field_type,
      options_json: f.options_json || null, required: !!f.required, display_order: f.display_order ?? (i * 10),
    })));
  }
  await logAudit(env.DB, { userId: user.user_id, action: "update", entityType: "custom_content_type", entityId: type.id, metadata: { slug: body.slug, fields_added: addedFields.length, fields_replaced: replacedFields ? replacedFields.length : undefined } });
  return success({ type, addedFields, fields: replacedFields });
}

if (path === "/api/v1/custom-type/delete" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["slug"]);
  const existing = await customTypesDB.getCustomContentType(env.DB, body.slug);
  if (!existing) return failure("Custom content type not found", 404);
  const dependentCount = await customTypesDB.countContentItemsOfCustomType(env.DB, body.slug);
  if (dependentCount > 0) {
    return failure(
      `Cannot delete: ${dependentCount} content item(s) still use the "${existing.label}" type. Delete or reassign them first.`,
      409
    );
  }
  await customTypesDB.deleteCustomContentType(env.DB, body.slug);
  await logAudit(env.DB, { userId: user.user_id, action: "delete", entityType: "custom_content_type", entityId: existing.id, metadata: { slug: body.slug, label: existing.label } });
  return success();
}

if (path === "/api/v1/comparisons/list" && request.method === "GET") {
  const url = new URL(request.url);
  const contentType = url.searchParams.get("content_type");
  if (!contentType) return failure("content_type is required");
  // Admin listing must see drafts too, not just published ones -- the
  // previous version of this endpoint always called
  // getPublishedComparisons(), so the admin table could never show (or
  // let an admin open/edit) a draft comparison. An explicit
  // status=published query param still gets the published-only list
  // for anywhere that specifically wants that.
  const statusFilter = url.searchParams.get("status");
  const { condition, params } = await itemAccess.getAccessibleWhereClause(env.DB, user, "comparisons", "read");
  const page = url.searchParams.has("page") ? Math.max(1, parseInt(url.searchParams.get("page")) || 1) : null;
  const perPage = Math.min(200, Math.max(1, parseInt(url.searchParams.get("per_page")) || 25));
  const opts = { status: statusFilter || null, extraCondition: condition || null, extraParams: params, limit: page != null ? perPage : 200, offset: page != null ? (page - 1) * perPage : 0, withTotal: page != null };
  const result = await comparisonsDB.getAllComparisons(env.DB, contentType, opts);
  if (page != null) return json({ success: true, comparisons: result.items, total: result.total, page, per_page: perPage });
  return json({ success: true, comparisons: result });
}

if (path === "/api/v1/comparison/create" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["content_type", "slug", "title"]);
  if (!Array.isArray(body.items) || body.items.length < 2) {
    return failure("At least 2 items are required to create a comparison");
  }
  const comparison = await comparisonsDB.createComparison(env.DB, {
    contentType: body.content_type, slug: body.slug, title: body.title, description: body.description || null,
    criteria: Array.isArray(body.criteria) ? body.criteria : [],
    editorialSelectionItemType: body.editorial_selection_item_type || null,
    editorialSelectionItemId: body.editorial_selection_item_id || null,
    status: body.status || "draft",
    seoTitle: body.seo_title || null, seoDescription: body.seo_description || null, seoKeywords: body.seo_keywords || null,
    authorId: body.author_id || null, createdBy: user.user_id,
    items: body.items.map((it, idx) => ({ itemContentType: it.item_content_type, itemId: it.item_id, position: it.position ?? idx })),
  });
  await logAudit(env.DB, { userId: user.user_id, action: "create", entityType: "comparison", entityId: comparison.id, metadata: { content_type: body.content_type, slug: body.slug, title: body.title } });
  return success({ comparison });
}

if (path === "/api/v1/comparison/get" && request.method === "GET") {
  const url = new URL(request.url);
  const contentType = url.searchParams.get("content_type");
  const slug = url.searchParams.get("slug");
  if (!contentType || !slug) return failure("content_type and slug are required");
  const comparison = await comparisonsDB.getComparison(env.DB, contentType, slug);
  if (!comparison) return failure("Comparison not found", 404);
  const canAccess = await itemAccess.canAccessItem(env.DB, user, "comparisons", "read", comparison);
  if (!canAccess) return failure("Comparison not found", 404);
  const items = await comparisonsDB.getComparisonItems(env.DB, comparison.id);
  return json({ success: true, comparison, items });
}

if (path === "/api/v1/comparison/update" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["content_type", "slug"]);
  const existing = await comparisonsDB.getComparison(env.DB, body.content_type, body.slug);
  if (!existing) return failure("Comparison not found", 404);
  const canAccess = await itemAccess.canAccessItem(env.DB, user, "comparisons", "update", existing);
  if (!canAccess) return failure("Comparison not found", 404);
  if (body.items && (!Array.isArray(body.items) || body.items.length < 2)) {
    return failure("At least 2 items are required for a comparison");
  }
  const comparison = await comparisonsDB.updateComparison(env.DB, existing.id, {
    title: body.title, description: body.description,
    criteria: Array.isArray(body.criteria) ? body.criteria : undefined,
    editorialSelectionItemType: body.editorial_selection_item_type !== undefined ? (body.editorial_selection_item_type || null) : undefined,
    editorialSelectionItemId: body.editorial_selection_item_id !== undefined ? (body.editorial_selection_item_id || null) : undefined,
    status: body.status, seoTitle: body.seo_title, seoDescription: body.seo_description,
    items: Array.isArray(body.items) ? body.items.map((it, idx) => ({ itemContentType: it.item_content_type, itemId: it.item_id, position: it.position ?? idx })) : undefined,
  });
  await logAudit(env.DB, { userId: user.user_id, action: "update", entityType: "comparison", entityId: existing.id, metadata: { content_type: body.content_type, slug: body.slug } });
  return success({ comparison });
}

if (path === "/api/v1/comparison/delete" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["content_type", "slug"]);
  const existing = await comparisonsDB.getComparison(env.DB, body.content_type, body.slug);
  if (!existing) return failure("Comparison not found", 404);
  const canAccess = await itemAccess.canAccessItem(env.DB, user, "comparisons", "delete", existing);
  if (!canAccess) return failure("Comparison not found", 404);
  await comparisonsDB.deleteComparison(env.DB, body.content_type, body.slug);
  await logAudit(env.DB, { userId: user.user_id, action: "delete", entityType: "comparison", entityId: existing.id, metadata: { content_type: body.content_type, slug: body.slug, title: existing.title } });
  return success();
}

if (path === "/api/v1/generic-review/create" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["reviewed_content_type", "reviewed_content_id", "slug", "title", "content"]);
  if (!["sportsbook", "affiliate_partner", "custom"].includes(body.reviewed_content_type)) {
    return failure("reviewed_content_type must be sportsbook, affiliate_partner, or custom");
  }
  const reviewedItem = await contentItemsDB.getContentItemById(env.DB, body.reviewed_content_type, body.reviewed_content_id);
  if (!reviewedItem) return failure("The item you're reviewing was not found -- check reviewed_content_id", 404);
  const review = await genericReviewsDB.createGenericReview(env.DB, {
    reviewedContentType: body.reviewed_content_type, reviewedContentId: body.reviewed_content_id,
    slug: body.slug, title: body.title, content: body.content,
    pros: body.pros || null, cons: body.cons || null,
    rating: body.rating !== undefined ? parseFloat(body.rating) || null : null,
    verdict: body.verdict || null,
    seoTitle: body.seo_title || null, seoDescription: body.seo_description || null, seoKeywords: body.seo_keywords || null,
    authorId: body.author_id || null, createdBy: user.user_id, published: !!body.published,
  });
  await logAudit(env.DB, { userId: user.user_id, action: "create", entityType: "review", entityId: review.id, metadata: { reviewed_content_type: body.reviewed_content_type, slug: body.slug } });
  return success({ review });
}

if (path === "/api/v1/generic-reviews/list" && request.method === "GET") {
  const url = new URL(request.url);
  const reviewedContentType = url.searchParams.get("reviewed_content_type");
  if (!reviewedContentType) return failure("reviewed_content_type is required");
  const page = url.searchParams.has("page") ? Math.max(1, parseInt(url.searchParams.get("page")) || 1) : null;
  const perPage = Math.min(200, Math.max(1, parseInt(url.searchParams.get("per_page")) || 25));
  if (page == null) {
    const reviews = await genericReviewsDB.getGenericReviewsForType(env.DB, reviewedContentType);
    return json({ success: true, reviews });
  }
  const result = await genericReviewsDB.getGenericReviewsForType(env.DB, reviewedContentType, { limit: perPage, offset: (page - 1) * perPage });
  return json({ success: true, reviews: result.items, total: result.total, page, per_page: perPage });
}

if (path === "/api/v1/generic-review/update" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["id"]);
  const fields = {};
  for (const key of ["title", "content", "pros", "cons", "verdict", "seo_title", "seo_description", "seo_keywords"]) {
    if (body[key] !== undefined) fields[key] = body[key];
  }
  if (body.rating !== undefined) fields.rating = parseFloat(body.rating) || null;
  if (body.published !== undefined) fields.published = body.published ? 1 : 0;
  if (body.author_id !== undefined) fields.author_id = body.author_id || null;
  const existingReview = await genericReviewsDB.getGenericReview(env.DB, body.id);
  if (!existingReview) return failure("Review not found or no fields to update", 404); // also what a casino review id gets here
  if (!(await itemAccess.canAccessItem(env.DB, user, "reviews", "update", existingReview))) return failure("Review not found or no fields to update", 404);
  const review = await genericReviewsDB.updateGenericReview(env.DB, body.id, fields);
  if (!review) return failure("Review not found or no fields to update", 404);
  await logAudit(env.DB, { userId: user.user_id, action: "update", entityType: "review", entityId: review.id, metadata: {} });
  return success({ review });
}

if (path === "/api/v1/generic-review/get" && request.method === "GET") {
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get("id"));
  if (!Number.isInteger(id)) return failure("id is required");
  const review = await genericReviewsDB.getGenericReview(env.DB, id); // generic-only: a casino review id is a 404 here
  if (!review) return failure("Review not found", 404);
  if (!(await itemAccess.canAccessItem(env.DB, user, "reviews", "read", review))) return failure("Review not found", 404);
  return json({ success: true, review });
}

if (path === "/api/v1/generic-review/delete" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["id"]);
  const existingReview = await genericReviewsDB.getGenericReview(env.DB, body.id); // generic-only: a casino review id is a 404 here
  if (!existingReview) return failure("Review not found", 404);
  if (!(await itemAccess.canAccessItem(env.DB, user, "reviews", "delete", existingReview))) return failure("Review not found", 404);
  await genericReviewsDB.deleteGenericReview(env.DB, body.id);
  await logAudit(env.DB, { userId: user.user_id, action: "delete", entityType: "review", entityId: existingReview.id, metadata: { reviewed_content_type: existingReview.reviewed_content_type, slug: existingReview.slug } });
  return success();
}

if (path === "/api/v1/content-types-enabled" && request.method === "GET") {
  // Same admin-only bar as the /update endpoint below -- this had no
  // role check at all before, so any authenticated user could read
  // which content types are enabled site-wide even though only an
  // admin can change it.
  if (user.role !== "admin") return failure("Only admins can view content type enablement", 403);
  const enablement = await getContentTypeEnablement(env);
  return json({ success: true, enablement });
}

if (path === "/api/v1/content-types-enabled/update" && request.method === "POST") {
  // Admin-only: this is a site-wide toggle, not a content-management
  // action, so it's gated separately from the content_items/
  // comparisons/custom_content_types permission rows -- an editor
  // with content-create rights should not also be able to flip what's
  // publicly visible on the whole site.
  if (user.role !== "admin") return failure("Only admins can change content type enablement", 403);
  const body = await request.json();
  const updates = {};
  for (const key of ["sportsbook", "affiliate_partner", "custom"]) {
    if (body[key] !== undefined) updates[key] = !!body[key];
  }
  const enablement = await updateContentTypeEnablement(env, updates);
  await logAudit(env.DB, { userId: user.user_id, action: "update", entityType: "settings", entityId: 0, metadata: { key: "content_types_enabled", value: enablement } });
  return success({ enablement });
}

// ==================================
// READ ENDPOINTS (add to api.js route handler)
// ==================================

// List reviews
if (path === "/api/v1/reviews/list") {
  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'reviews', 'read', ''
  );
  const whereParts = ['published = 1'];
  if (condition) whereParts.push(condition);
  const whereClause = 'WHERE ' + whereParts.join(' AND ');

  const result = await env.DB.prepare(
    `SELECT * FROM reviews ${whereClause} ORDER BY created_at DESC`
  ).bind(...params).all();
  return json({ reviews: result.results });
}

// List news
if (path === "/api/v1/news/list") {
  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'news', 'read', ''
  );
  const whereClause = condition ? `WHERE ${condition}` : '';

  const result = await env.DB.prepare(
    `SELECT n.*, m.url AS featured_image_url, m.thumbnail_url AS featured_image_thumbnail,
            m.alt_text AS featured_image_alt, og.url AS og_image_url,
            og.thumbnail_url AS og_image_thumbnail, og.alt_text AS og_image_alt,
            a.name AS author_name, a.slug AS author_slug,
            a.avatar_url AS author_avatar, a.role AS author_role
     FROM news n
     LEFT JOIN media_library m ON m.id = n.featured_image
     LEFT JOIN media_library og ON og.id = n.og_image
     LEFT JOIN authors a ON a.id = n.author_id
     ${whereClause}
     ORDER BY COALESCE(n.published_at, n.created_at) DESC`
  ).bind(...params).all();
  return json({ news: result.results });
}


if (path === "/api/v1/newsbackup2/list") {
  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'news', 'read', ''
  );
  const whereParts = ['1=1'];
//  const whereParts = ['n.published = 1'];
  if (condition) whereParts.push(condition);
  const whereClause = 'WHERE ' + whereParts.join(' AND ');

  const result = await env.DB.prepare(
    `SELECT n.*, m.url AS featured_image_url, m.thumbnail_url AS featured_image_thumbnail,
            m.alt_text AS featured_image_alt, a.name AS author_name, a.slug AS author_slug,
            a.avatar_url AS author_avatar, a.role AS author_role
     FROM news n
     LEFT JOIN media_library m ON m.id = n.featured_image
     LEFT JOIN authors a ON a.id = n.author_id
     ${whereClause}
     ORDER BY COALESCE(n.published_at, n.created_at) DESC`
  ).bind(...params).all();
  return json({ news: result.results });
}


if (path === "/api/v1/newsbackup/list") {
  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'news', 'read', ''
  );
  const whereParts = ['published = 1'];
  if (condition) whereParts.push(condition);
  const whereClause = 'WHERE ' + whereParts.join(' AND ');

  const result = await env.DB.prepare(
    `SELECT * FROM news ${whereClause} ORDER BY created_at DESC`
  ).bind(...params).all();
  return json({ news: result.results });
}

// List pages
if (path === "/api/v1/pages/list") {
  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'pages', 'read', ''
  );
  const whereClause = condition ? `WHERE ${condition}` : '';

  const result = await env.DB.prepare(
    `SELECT * FROM pages ${whereClause} ORDER BY created_at DESC`
  ).bind(...params).all();
  return json({ pages: result.results });
}


// List categories
if (path === "/api/v1/categories/list") {
  const result = await env.DB.prepare(`
    SELECT * FROM categories ORDER BY name
  `).all();
  return json({ categories: result.results });
}


// Get settings
if (path === "/api/v1/settings/get") {
  const result = await env.DB.prepare(`
    SELECT key, value FROM settings
  `).all();
  const settings = {};
  for (const row of result.results) {
    settings[row.key] = row.value;
  }
  return json({ settings });
}

// Get stats (already exists but move here for consistency)
if (path === "/api/v1/stats") {
  const casinos = await env.DB.prepare("SELECT COUNT(*) c FROM casinos").first();
  const reviews = await env.DB.prepare("SELECT COUNT(*) c FROM reviews").first();
  const clicks = await env.DB.prepare("SELECT COUNT(*) c FROM clicks").first();
  const pages = await env.DB.prepare("SELECT COUNT(*) c FROM pages").first();
  return json({
    casinos: casinos.c,
    reviews: reviews.c,
    clicks: clicks.c,
    pages: pages.c
  });
}
if (path === "/api/v1/stats/top-casinos") {
    const result = await env.DB.prepare(`
      SELECT casino_slug, COUNT(*) as clicks
      FROM clicks
      GROUP BY casino_slug
      ORDER BY clicks DESC
      LIMIT 20
    `).all();
    return json({ casinos: result.results });
  }

  if (path === "/api/v1/stats/countries") {
    const result = await env.DB.prepare(`
      SELECT country_code, COUNT(*) as clicks
      FROM clicks
      GROUP BY country_code
      ORDER BY clicks DESC
      LIMIT 100
    `).all();
    return json({ countries: result.results });
  }

    // ==================================
// NEWSROOM (editorial workflow, taxonomy, sources, corrections)
// Self-contained: performs its own permission + item-access checks.
// ==================================
if (path.startsWith("/api/v1/newsroom/")) {
  const newsroomResponse = await handleNewsroomApi(request, env, user);
  if (newsroomResponse) return newsroomResponse;
}

    // ==================================
// NEWS
// ==================================

if (
  path === "/api/v1/news/create" &&
  request.method === "POST"
) {
  return createNews(request, env, user);
}

if (
  path === "/api/v1/news/update" &&
  request.method === "POST"
) {
  return updateNews(request, env, user);
}

if (
  path === "/api/v1/news/delete" &&
  request.method === "POST"
) {
  return deleteNews(request, env, user);
}

/* =========================================================
PLATFORM UPDATES ADMIN API========================================================= */
if (path === "/api/v1/platform-updates/list" &&request.method === "GET") {return listPlatformUpdates(request, env, user);}

if (path === "/api/v1/platform-updates/create" &&request.method === "POST") {return createPlatformUpdate(request, env, user);}

if (path === "/api/v1/platform-updates/update" &&request.method === "POST") {return updatePlatformUpdate(request, env, user);}

if (path === "/api/v1/platform-updates/delete" &&request.method === "POST") {return deletePlatformUpdate(request, env, user);}

/* =========================================================
SEO LANDING PAGES ADMIN API (country_custom / category_country)
========================================================= */
if (path === "/api/v1/seo-pages/list" && request.method === "GET") {return listSeoPagesEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/get" && request.method === "GET") {return getSeoPageEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/create" && request.method === "POST") {return createSeoPageEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/update" && request.method === "POST") {return updateSeoPageEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/delete" && request.method === "POST") {return deleteSeoPageEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/countries-search" && request.method === "GET") {return searchCountriesEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/eligible-casinos" && request.method === "GET") {return eligibleCasinosEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/discover" && request.method === "GET") {return discoverCategoryCountryEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/generate-draft" && request.method === "POST") {return generateCategoryCountryDraftEndpoint(request, env, user);}


    // ==================================
    // REVIEWS
    // ==================================

    if (
      path === "/api/v1/review/create" &&
      request.method === "POST"
    ) {
      return createReview(request, env, user);
    }

    if (
      path === "/api/v1/review/update" &&
      request.method === "POST"
    ) {
      return updateReview(request, env, user);
    }

    // ==================================
    // PAGES
    // ==================================

    if (
      path === "/api/v1/page/create" &&
      request.method === "POST"
    ) {
      return createPage(request, env, user);
    }

    if (
      path === "/api/v1/page/update" &&
      request.method === "POST"
    ) {
      return updatePage(request, env, user);
    }

    // ==================================
    // GEO RULES
    // ==================================
    if (
      path === "/api/v1/geo/save" &&
      request.method === "POST"
    ) {
      const result = await saveGeoRule(request, env);
      await invalidateCasinos(env);
      return result;
    }


        // ==================================
    // GEO RULES — BULK SYNC + LISTING
    // ==================================

    if (path === "/api/v1/geo/sync" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["casino_slug", "rules"]);
      const { setCasinoGeoRules } = await import("./database/geo.js");
      await setCasinoGeoRules(env.DB, body.casino_slug, body.rules);
      await invalidateCasinos(env);
      return success();
    }


    if (path === "/api/v1/geo/list" && request.method === "GET") {
      const url = new URL(request.url);
      const casinoSlug = url.searchParams.get("casino_slug");
      if (!casinoSlug) return failure("casino_slug is required");
      const { getGeoRulesForCasino } = await import("./database/geo.js");
      const rules = await getGeoRulesForCasino(env.DB, casinoSlug);
      return json({ rules });
    }


    // ==================================
    // AI REVIEW
    // ==================================

    if (
      path === "/api/v1/ai/review" &&
      request.method === "POST"
    ) {
      return generateReview(request, env);
    }


// ── LUMMET AI NON-STREAMING CHAT ──
if (path === "/api/v1/ai/chat" && request.method === "POST") {
  return handleChat(request, env, user);
}
    // ── LUMMET AI STREAMING CHAT ──
if (path === "/api/v1/ai/chat/stream" && request.method === "POST") {
  return handleChatStream(request, env, user);
}

// ── LUMMET AI CLEAR CONVERSATION ──
if (path === "/api/v1/ai/chat/clear" && request.method === "POST") {
  return handleClearChat(request, env, user);
}

    // ==================================
    // SETTINGS
    // ==================================

    if (
      path === "/api/v1/settings/save" &&
      request.method === "POST"
    ) {
      return saveSettings(request, env, user);
    }

    // ==================================
    // CATEGORIES CRUD
    // ==================================
    if (path === "/api/v1/category/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "name"]);
      await categories.createCategory(env.DB, body);
      await invalidateCategories(env);
      await invalidateNav(env);
      return success();
    }

    if (path === "/api/v1/category/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "name"]);
      const { updateCategory } = await import("./database/categories.js");
      await updateCategory(env.DB, body.slug, body);
      await invalidateCategories(env);
      await invalidateNav(env);
      return success();
    }
    if (path === "/api/v1/category/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug"]);
      const { deleteCategory } = await import("./database/categories.js");
      await deleteCategory(env.DB, body.slug);
      await invalidateCategories(env);
      await invalidateNav(env);
      return success();
    }

    // Section-level casino pickers on the base category hub page
    // (countries.html/categories.html "Content sections" builder)
    // have no country context, unlike seo-pages' eligible-casinos —
    // they pull every casino already in this category, matching
    // exactly what the category page's own automatic grid shows.
    if (path === "/api/v1/category/eligible-casinos" && request.method === "GET") {
      const urlObj = new URL(request.url);
      const slug = urlObj.searchParams.get("slug");
      if (!slug) return failure("slug is required", 422);
      const rows = await categories.getCategoryCasinos(env.DB, slug);
      return json({ success: true, casinos: rows });
    }



    // ==================================
    // PAYMENT METHODS CRUD
    // ==================================
    if (path === "/api/v1/payment-methods/list" && request.method === "GET") {
      const rows = await paymentMethods.getAllPaymentMethods(env.DB);
      return json({ success: true, payment_methods: rows });
    }

    if (path === "/api/v1/payment-method/get-by-id" && request.method === "GET") {
      const urlObj = new URL(request.url);
      const id = urlObj.searchParams.get("id");
      if (!id) return failure("id is required", 422);
      const row = await env.DB.prepare(`SELECT * FROM payment_methods WHERE id = ?`).bind(id).first();
      if (!row) return failure("Not found", 404);
      return json({ success: true, payment_method: row });
    }

    if (path === "/api/v1/payment-method/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "name"]);
      await paymentMethods.createPaymentMethod(env.DB, body);
      return success();
    }

    if (path === "/api/v1/payment-method/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "name"]);
      await paymentMethods.updatePaymentMethod(env.DB, body.slug, body);
      return success();
    }

    if (path === "/api/v1/payment-method/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug"]);
      await paymentMethods.deletePaymentMethod(env.DB, body.slug);
      return success();
    }

    // Casinos currently linked to a payment method -- feeds the
    // "which casinos accept this" checkbox pre-check on the edit form.
    if (path === "/api/v1/payment-method/casinos" && request.method === "GET") {
      const urlObj = new URL(request.url);
      const slug = urlObj.searchParams.get("slug");
      if (!slug) return failure("slug is required", 422);
      const casinoIds = await paymentMethods.getCasinoIdsForPaymentMethod(env.DB, slug);
      return json({ success: true, casino_ids: casinoIds });
    }

    // Full casino rows accepted for this payment method's own
    // content-section casino pickers (casino_grid/casino_editorial/
    // casino_spotlights) -- same role as /category/eligible-casinos.
    if (path === "/api/v1/payment-method/eligible-casinos" && request.method === "GET") {
      const urlObj = new URL(request.url);
      const slug = urlObj.searchParams.get("slug");
      if (!slug) return failure("slug is required", 422);
      const rows = await paymentMethods.getCasinosForPaymentMethod(env.DB, slug);
      return json({ success: true, casinos: rows });
    }

    // Replaces the full casino list for ONE payment method in a
    // single call (bulk direction #1: one method -> many casinos).
    // Body: { payment_method_id, casino_ids: [...] }
    if (path === "/api/v1/payment-method/set-casinos" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["payment_method_id"]);
      await paymentMethods.setCasinosForPaymentMethod(env.DB, body.payment_method_id, body.casino_ids || []);
      return success();
    }

    // Payment methods currently linked to a casino -- feeds the
    // "which methods this casino accepts" checkbox pre-check on the
    // casino edit form (bulk direction #2, see below).
    if (path === "/api/v1/casino/payment-methods" && request.method === "GET") {
      const urlObj = new URL(request.url);
      const casinoId = urlObj.searchParams.get("casino_id");
      if (!casinoId) return failure("casino_id is required", 422);
      const paymentMethodIds = await paymentMethods.getPaymentMethodIdsForCasino(env.DB, casinoId);
      return json({ success: true, payment_method_ids: paymentMethodIds });
    }

    // Replaces the full payment-method list for ONE casino in a
    // single call (bulk direction #2: one casino -> many methods).
    // Body: { casino_id, payment_method_ids: [...] }
    if (path === "/api/v1/casino/set-payment-methods" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["casino_id"]);
      await paymentMethods.setCasinoPaymentMethods(env.DB, body.casino_id, body.payment_method_ids || []);
      return success();
    }



    // ==================================
    // COUNTRIES CRUD
    // ==================================
    if (path === "/api/v1/country/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["code", "name"]);
      const { createCountry } = await import("./database/countries.js");
      await createCountry(env.DB, body);
      await invalidateCountries(env);
      await invalidateNav(env);
      return success();
    }

    if (path === "/api/v1/country/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["code", "name"]);
      const { updateCountry } = await import("./database/countries.js");
      await updateCountry(env.DB, body.code, body);
      await invalidateCountries(env);
      await invalidateNav(env);
      return success();
    }

    if (path === "/api/v1/country/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["code"]);
      const { deleteCountry } = await import("./database/countries.js");
      await deleteCountry(env.DB, body.code);
      await invalidateCountries(env);
      await invalidateNav(env);
      return success();
    }


    if (path === "/api/v1/countries/list") {
      const result = await env.DB.prepare("SELECT * FROM countries ORDER BY name").all();
      return json({ countries: result.results });
    }


    // ==================================
    // RESEARCH CRUD (Phase 1)
    // ==================================
    if (path === "/api/v1/research/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["type", "slug", "title"]);
      const researchDB = await import("./database/research.js");
      if (!researchDB.isValidResearchType(body.type)) {
        return json({ success: false, error: `Invalid research type: ${body.type}` }, 422);
      }
      const result = await researchDB.createResearchItem(env.DB, body);
      const newId = result.meta?.last_row_id;
      if (newId) {
        const versionsDB = await import("./database/research-versions.js");
        const savedItem = await researchDB.getResearchItemById(env.DB, newId);
        const currentUser = await getCurrentUser(request, env);
        await versionsDB.createVersionIfChanged(env.DB, savedItem, { changedBy: currentUser?.email || null });
      }
      return success({ id: newId });
    }

    if (path === "/api/v1/research/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "type", "slug", "title"]);
      const researchDB = await import("./database/research.js");
      if (!researchDB.isValidResearchType(body.type)) {
        return json({ success: false, error: `Invalid research type: ${body.type}` }, 422);
      }
      await researchDB.updateResearchItem(env.DB, body.id, body);
      const versionsDB = await import("./database/research-versions.js");
      const savedItem = await researchDB.getResearchItemById(env.DB, body.id);
      const currentUser = await getCurrentUser(request, env);
      await versionsDB.createVersionIfChanged(env.DB, savedItem, { changedBy: currentUser?.email || null, changeSummary: body.change_summary || null });
      return success();
    }

    if (path === "/api/v1/research/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const researchDB = await import("./database/research.js");
      await researchDB.deleteResearchItem(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/research/list" && request.method === "GET") {
      const researchDB = await import("./database/research.js");
      const items = await researchDB.getAllResearchItems(env.DB);
      return json({ research: items });
    }

    if (path === "/api/v1/research/get-by-id" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const id = parseInt(reqUrl.searchParams.get("id"));
      if (!id) return failure("id is required");
      const researchDB = await import("./database/research.js");
      const item = await researchDB.getResearchItemById(env.DB, id);
      if (!item) return failure("Research item not found", 404);
      return json({ success: true, item });
    }

    if (path === "/api/v1/research/overdue" && request.method === "GET") {
      const researchDB = await import("./database/research.js");
      const items = await researchDB.getOverdueResearchItems(env.DB);
      return json({ items });
    }

    // ==================================
    // RESEARCH SOURCES CRUD (Phase 2)
    // Global, reusable — a source is never duplicated per item.
    // ==================================
    if (path === "/api/v1/research-sources/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["organisation"]);
      const sourcesDB = await import("./database/research-sources.js");
      if (body.source_type && !sourcesDB.isValidSourceType(body.source_type)) {
        return failure(`Invalid source type: ${body.source_type}`, 422);
      }
      await sourcesDB.createSource(env.DB, body);
      return success();
    }

    if (path === "/api/v1/research-sources/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "organisation"]);
      const sourcesDB = await import("./database/research-sources.js");
      if (body.source_type && !sourcesDB.isValidSourceType(body.source_type)) {
        return failure(`Invalid source type: ${body.source_type}`, 422);
      }
      await sourcesDB.updateSource(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/research-sources/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const sourcesDB = await import("./database/research-sources.js");
      await sourcesDB.deleteSource(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/research-sources/list" && request.method === "GET") {
      const sourcesDB = await import("./database/research-sources.js");
      const sources = await sourcesDB.getAllSources(env.DB);
      return json({ sources });
    }

    if (path === "/api/v1/research-sources/get" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const id = parseInt(reqUrl.searchParams.get("id"));
      if (!id) return failure("id is required");
      const sourcesDB = await import("./database/research-sources.js");
      const source = await sourcesDB.getSource(env.DB, id);
      if (!source) return failure("Source not found", 404);
      return json({ success: true, source });
    }

    // ==================================
    // RESEARCH CLAIMS CRUD (Phase 2)
    // Scoped to a single research_item; sourced via
    // research_claim_sources (attach/detach below).
    // ==================================
    if (path === "/api/v1/research-claims/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["research_item_id", "claim_text"]);
      const claimsDB = await import("./database/research-claims.js");
      if (body.status && !claimsDB.isValidClaimStatus(body.status)) {
        return failure(`Invalid claim status: ${body.status}`, 422);
      }
      const result = await claimsDB.createClaim(env.DB, body);
      return success({ id: result.meta?.last_row_id });
    }

    if (path === "/api/v1/research-claims/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "claim_text"]);
      const claimsDB = await import("./database/research-claims.js");
      if (body.status && !claimsDB.isValidClaimStatus(body.status)) {
        return failure(`Invalid claim status: ${body.status}`, 422);
      }
      await claimsDB.updateClaim(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/research-claims/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const claimsDB = await import("./database/research-claims.js");
      await claimsDB.deleteClaim(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/research-claims/list-for-item" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const researchItemId = parseInt(reqUrl.searchParams.get("research_item_id"));
      if (!researchItemId) return failure("research_item_id is required");
      const claimsDB = await import("./database/research-claims.js");
      const claims = await claimsDB.getClaimsForResearchItem(env.DB, researchItemId);
      return json({ claims });
    }

    if (path === "/api/v1/research-claims/attach-source" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["claim_id", "source_id"]);
      const claimsDB = await import("./database/research-claims.js");
      if (body.support_type && !claimsDB.isValidSupportType(body.support_type)) {
        return failure(`Invalid support type: ${body.support_type}`, 422);
      }
      await claimsDB.attachSourceToClaim(env.DB, body);
      return success();
    }

    if (path === "/api/v1/research-claims/detach-source" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const claimsDB = await import("./database/research-claims.js");
      await claimsDB.detachSourceFromClaim(env.DB, body.id);
      return success();
    }

    // ==================================
    // RESEARCH RELATIONS (Phase 3)
    // The generic entity graph — from/to can be a research item OR
    // an existing casino/country/category/payment_method row.
    // ==================================
    if (path === "/api/v1/research-relations/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["from_type", "from_id", "to_type", "to_id", "relation_type"]);
      const relationsDB = await import("./database/research-relations.js");
      if (!relationsDB.isValidEntityType(body.from_type)) return failure(`Invalid from_type: ${body.from_type}`, 422);
      if (!relationsDB.isValidEntityType(body.to_type)) return failure(`Invalid to_type: ${body.to_type}`, 422);
      if (!relationsDB.isValidRelationType(body.relation_type)) return failure(`Invalid relation_type: ${body.relation_type}`, 422);
      try {
        await relationsDB.createRelation(env.DB, body);
      } catch (e) {
        if (String(e.message).includes("UNIQUE")) return failure("This relationship already exists.", 409);
        throw e;
      }
      return success();
    }

    if (path === "/api/v1/research-relations/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const relationsDB = await import("./database/research-relations.js");
      await relationsDB.deleteRelation(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/research-relations/list-for-entity" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const entityType = reqUrl.searchParams.get("type");
      const entityId = reqUrl.searchParams.get("id");
      const relationsDB = await import("./database/research-relations.js");
      if (!entityType || !entityId || !relationsDB.isValidEntityType(entityType)) {
        return failure("Valid type and id are required");
      }
      const relations = await relationsDB.getAllRelationsForEntity(env.DB, entityType, entityId);
      return json({ relations });
    }

    if (path === "/api/v1/research-relations/search-entities" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const q = reqUrl.searchParams.get("q") || "";
      const relationsDB = await import("./database/research-relations.js");
      if (q.trim().length < 2) return json({ results: [] });
      const results = await relationsDB.searchEntities(env.DB, q.trim());
      return json({ results });
    }

    // ==================================
    // RESEARCH VERSIONS (Phase 4)
    // Snapshots are written automatically by research/create and
    // research/update above (see createVersionIfChanged) — the only
    // write endpoint needed here is restore.
    // ==================================
    if (path === "/api/v1/research-versions/list-for-item" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const researchItemId = parseInt(reqUrl.searchParams.get("research_item_id"));
      if (!researchItemId) return failure("research_item_id is required");
      const versionsDB = await import("./database/research-versions.js");
      const versions = await versionsDB.getVersionsForItem(env.DB, researchItemId);
      return json({ versions });
    }

    if (path === "/api/v1/research-versions/get" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const id = parseInt(reqUrl.searchParams.get("id"));
      if (!id) return failure("id is required");
      const versionsDB = await import("./database/research-versions.js");
      const version = await versionsDB.getVersion(env.DB, id);
      if (!version) return failure("Version not found", 404);
      return json({ success: true, version });
    }

    if (path === "/api/v1/research-versions/diff" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const id = parseInt(reqUrl.searchParams.get("id"));
      const compareTo = reqUrl.searchParams.get("compare_to"); // version id, or "current"
      if (!id) return failure("id is required");
      const versionsDB = await import("./database/research-versions.js");
      const version = await versionsDB.getVersion(env.DB, id);
      if (!version) return failure("Version not found", 404);

      let otherSnapshot;
      if (compareTo === "current" || !compareTo) {
        const researchDB = await import("./database/research.js");
        const currentItem = await researchDB.getResearchItemById(env.DB, version.research_item_id);
        otherSnapshot = currentItem ? {
          type: currentItem.type, slug: currentItem.slug, title: currentItem.title,
          subtitle: currentItem.subtitle, excerpt: currentItem.excerpt, content_json: currentItem.content_json,
          country_id: currentItem.country_id, author_id: currentItem.author_id, status: currentItem.status,
          published: currentItem.published, robots: currentItem.robots, seo_title: currentItem.seo_title,
          seo_description: currentItem.seo_description, seo_keywords: currentItem.seo_keywords,
          canonical_url: currentItem.canonical_url, og_image: currentItem.og_image, featured: currentItem.featured
        } : null;
      } else {
        const other = await versionsDB.getVersion(env.DB, parseInt(compareTo));
        otherSnapshot = other?.content_snapshot || null;
      }

      const changes = versionsDB.diffSnapshots(version.content_snapshot, otherSnapshot);
      return json({ changes });
    }

    if (path === "/api/v1/research-versions/restore" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const versionsDB = await import("./database/research-versions.js");
      const currentUser = await getCurrentUser(request, env);
      try {
        const restoredItem = await versionsDB.restoreVersion(env.DB, body.id, { changedBy: currentUser?.email || null });
        return success({ item: restoredItem });
      } catch (e) {
        return failure(e.message || "Could not restore version", 404);
      }
    }

    // ==================================
    // RESEARCH REVIEW QUEUE (Phase 5)
    // Read-only — every list here is computed from existing data,
    // nothing new is stored except the source-health status update
    // below, which reuses a column research_sources already has.
    // ==================================
    if (path === "/api/v1/research-review-queue/summary" && request.method === "GET") {
      const queueDB = await import("./database/research-review-queue.js");
      const counts = await queueDB.getReviewQueueCounts(env.DB);
      return json({ counts });
    }

    if (path === "/api/v1/research-review-queue/list" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const category = reqUrl.searchParams.get("category");
      const queueDB = await import("./database/research-review-queue.js");
      const handlers = {
        overdue_verification: queueDB.getOverdueVerification,
        broken_sources: queueDB.getBrokenSources,
        stale_sources: queueDB.getStaleSources,
        missing_citations: queueDB.getItemsMissingCitations,
        missing_seo: queueDB.getItemsMissingSeo,
        orphan_relations: queueDB.getOrphanRelations,
      };
      const handler = handlers[category];
      if (!handler) return failure(`Unknown review queue category: ${category}`, 422);
      const items = await handler(env.DB);
      return json({ items });
    }

    if (path === "/api/v1/research-sources/check-health" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const sourcesDB = await import("./database/research-sources.js");
      const source = await sourcesDB.getSource(env.DB, body.id);
      if (!source) return failure("Source not found", 404);
      const { checkAndRecordSourceHealth } = await import("./research/source-health.js");
      const result = await checkAndRecordSourceHealth(env.DB, source);
      return json({ success: true, result });
    }

    // ==================================
    // RESEARCH DATASETS (Phase 6)
    // Reusable, versioned tables that report sections, country
    // pages, and comparison pages all pull from via a
    // { type: 'dataset_table' } content block — see
    // renderResearchSections() in controllers.js.
    // ==================================
    if (path === "/api/v1/research-datasets/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "title"]);
      const datasetsDB = await import("./database/research-datasets.js");
      if (body.status && !datasetsDB.isValidDatasetStatus(body.status)) {
        return failure(`Invalid dataset status: ${body.status}`, 422);
      }
      const result = await datasetsDB.createDataset(env.DB, body);
      const newId = result.meta?.last_row_id;
      if (newId) {
        const savedDataset = await datasetsDB.getDataset(env.DB, newId);
        const currentUser = await getCurrentUser(request, env);
        await datasetsDB.createDatasetVersionIfChanged(env.DB, savedDataset, { changedBy: currentUser?.email || null });
      }
      return success({ id: newId });
    }

    if (path === "/api/v1/research-datasets/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "slug", "title"]);
      const datasetsDB = await import("./database/research-datasets.js");
      if (body.status && !datasetsDB.isValidDatasetStatus(body.status)) {
        return failure(`Invalid dataset status: ${body.status}`, 422);
      }
      await datasetsDB.updateDataset(env.DB, body.id, body);
      const savedDataset = await datasetsDB.getDataset(env.DB, body.id);
      const currentUser = await getCurrentUser(request, env);
      await datasetsDB.createDatasetVersionIfChanged(env.DB, savedDataset, { changedBy: currentUser?.email || null, changeSummary: body.change_summary || null });
      return success();
    }

    if (path === "/api/v1/research-datasets/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const datasetsDB = await import("./database/research-datasets.js");
      await datasetsDB.deleteDataset(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/research-datasets/list" && request.method === "GET") {
      const datasetsDB = await import("./database/research-datasets.js");
      const datasets = await datasetsDB.getAllDatasets(env.DB);
      return json({ datasets });
    }

    if (path === "/api/v1/research-datasets/get" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const id = parseInt(reqUrl.searchParams.get("id"));
      if (!id) return failure("id is required");
      const datasetsDB = await import("./database/research-datasets.js");
      const dataset = await datasetsDB.getDataset(env.DB, id);
      if (!dataset) return failure("Dataset not found", 404);
      return json({ success: true, dataset });
    }

    if (path === "/api/v1/research-datasets/get-by-slug" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const slug = reqUrl.searchParams.get("slug");
      if (!slug) return failure("slug is required");
      const datasetsDB = await import("./database/research-datasets.js");
      const dataset = await datasetsDB.getDatasetBySlug(env.DB, slug);
      if (!dataset) return failure("Dataset not found", 404);
      return json({ success: true, dataset });
    }

    if (path === "/api/v1/research-datasets/versions" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const datasetId = parseInt(reqUrl.searchParams.get("dataset_id"));
      if (!datasetId) return failure("dataset_id is required");
      const datasetsDB = await import("./database/research-datasets.js");
      const versions = await datasetsDB.getDatasetVersions(env.DB, datasetId);
      return json({ versions });
    }


    // ==================================
    // REVIEW DELETE + PAGE DELETE
    // ==================================

    if (path === "/api/v1/review/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug"]);

      const existing = await itemAccess.getItemBySlug(env.DB, 'reviews', body.slug);
      if (!existing) return failure("Review not found", 404);
      const canDelete = await itemAccess.canAccessItem(env.DB, user, 'reviews', 'delete', existing);
      if (!canDelete) return failure("Review not found", 404);

      const { deleteReview } = await import("./database/reviews.js");
      await deleteReview(env.DB, body.slug);
      return success();
    }

    if (path === "/api/v1/page/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug"]);

      const existing = await itemAccess.getItemBySlug(env.DB, 'pages', body.slug);
      if (!existing) return failure("Page not found", 404);
      const canDelete = await itemAccess.canAccessItem(env.DB, user, 'pages', 'delete', existing);
      if (!canDelete) return failure("Page not found", 404);

      const { deletePage } = await import("./database/pages.js");
      await deletePage(env.DB, body.slug);
      return success();
    }

    // ==================================
    // COMPONENTS CRUD
    // ==================================

    if (path === "/api/v1/components/list") {
      const url = new URL(request.url);
      const type = url.searchParams.get("type");
      const result = await componentsDB.getAllComponents(env.DB, type);
      return json({ components: result });
    }

    if (path === "/api/v1/component/get" && request.method === "GET") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const component = await componentsDB.getComponent(env.DB, id);
      if (!component) return failure("Component not found", 404);
      return json({ success: true, component });
    }

    if (path === "/api/v1/component/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name", "type"]);
      if (body.type === "hero") {
        try { body.settings_json = cleanHeroSettingsJson(body.settings_json); }
        catch (err) { return failure(err.message); }
      }
      const id = await componentsDB.createComponent(env.DB, body);
      return json({ success: true, id });
    }

    if (path === "/api/v1/component/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "name", "type"]);
      if (body.type === "hero") {
        try { body.settings_json = cleanHeroSettingsJson(body.settings_json); }
        catch (err) { return failure(err.message); }
      }
      await componentsDB.updateComponent(env.DB, body.id, body);
      return success();
    }

    // Draft preview of a hero component: the same HTML the public page would get, built from
    // the form's current values. Nothing is saved.
    if (path === "/api/v1/component/hero-preview" && request.method === "POST") {
      const body = await request.json();
      let settings = {};
      try { settings = JSON.parse(cleanHeroSettingsJson(body.settings_json) || "{}"); }
      catch (err) { return failure(err.message); }
      // the preview always uses the advanced layout so that every option can be seen
      settings.design = "advanced";
      const html = renderAdvancedHero({
        id: 0,
        type: "hero",
        title: String(body.title || ""),
        content: String(body.content || ""),
        settings,
        injection_point: "top"
      });
      return json({ success: true, html });
    }

    if (path === "/api/v1/component/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await componentsDB.deleteComponent(env.DB, body.id);
      return success();
    }

    // ==================================
    // PAGE-COMPONENT ASSIGNMENTS
    // ==================================

    if (path === "/api/v1/components/assign" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["page_type", "page_slug", "component_id"]);
      await componentsDB.assignComponentToPage(env.DB, body);
      return success();
    }

    if (path === "/api/v1/components/bulk-assign" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["page_type", "component_id"]);
      await componentsDB.bulkAssignComponent(env.DB, body);
      return success();
    }
    if (path === "/api/v1/components/unassign" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await componentsDB.removePageComponent(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/components/page" && request.method === "GET") {
      const url = new URL(request.url);
      const pageType = url.searchParams.get("page_type");
      const pageSlug = url.searchParams.get("page_slug");
      if (!pageType || !pageSlug) return failure("page_type and page_slug are required");
      const assignments = await componentsDB.getAllPageAssignments(env.DB, pageType, pageSlug);
      return json({ assignments });
    }

    if (path === "/api/v1/components/reorder" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["items"]);
      for (const item of body.items) {
        await componentsDB.updatePageComponentPosition(env.DB, item.id, item.position);
      }
      return success();
    }

    if (path === "/api/v1/components/toggle" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "enabled"]);
      await componentsDB.togglePageComponent(env.DB, body.id, body.enabled);
      return success();
    }

    if (path === "/api/v1/components/update-assignment" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await componentsDB.updatePageComponentAssignment(env.DB, body.id, body);
      return success();
    }

    // ============================================================
// AD RULES API — with authorization + validation
// ============================================================

// ── Authorization helper ─────────────────────────────────

async function requireAdAdmin(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) throw new Error('Authentication required');
  if (user.role !== 'admin' && user.role !== 'editor') {
    throw new Error('Insufficient permissions. Admin or editor role required.');
  }
  return user;
}

// ── Routes ───────────────────────────────────────────────
  if (path === "/api/v1/ad-rules/list" && request.method === "GET") {
    try {
      const user = await requireAdAdmin(request, env);
      const rules = await adRulesDB.getAllAdRules(env.DB);
      return json({ rules });
    } catch (e) {
      return json({ error: e.message }, 403);
    }
  }

  if (path === "/api/v1/ad-rules/create" && request.method === "POST") {
    try {
      await requireAdAdmin(request, env);
      const body = await request.json();
      await adRulesDB.createAdRule(env.DB, body);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 400);
    }
  }

  if (path === "/api/v1/ad-rules/update" && request.method === "POST") {
    try {
      await requireAdAdmin(request, env);
      const body = await request.json();
      await adRulesDB.updateAdRule(env.DB, body.id, body);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 400);
    }
  }

  if (path === "/api/v1/ad-rules/delete" && request.method === "POST") {
    try {
      await requireAdAdmin(request, env);
      const body = await request.json();
      await adRulesDB.deleteAdRule(env.DB, body.id);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 400);
    }
  }

  if (path === "/api/v1/ad-rules/validate" && request.method === "POST") {
    try {
      await requireAdAdmin(request, env);
      const body = await request.json();
      const { VALID_PLACEMENTS, VALID_DEVICES, VALID_PAGE_TYPES } = adRulesDB;
      return json({
        valid_placements: VALID_PLACEMENTS,
        valid_devices: VALID_DEVICES,
        valid_page_types: VALID_PAGE_TYPES
      });
    } catch (e) {
      return json({ error: e.message }, 403);
    }
  }



    // ==================================
    // REVIEW BLOCKS CRUD
    // ==================================

    if (path === "/api/v1/review-blocks/list" && request.method === "GET") {
      const url = new URL(request.url);
      const reviewSlug = url.searchParams.get("review_slug");
      if (!reviewSlug) return failure("review_slug is required");
      const blocks = await reviewBlocksDB.getReviewBlocks(env.DB, reviewSlug);
      return json({ blocks });
    }

    if (path === "/api/v1/review-blocks/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["review_slug", "title", "content"]);
      const id = await reviewBlocksDB.createReviewBlock(env.DB, body);
      return json({ success: true, id });
    }

    if (path === "/api/v1/review-blocks/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "title", "content"]);
      await reviewBlocksDB.updateReviewBlock(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/review-blocks/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await reviewBlocksDB.deleteReviewBlock(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/review-blocks/sync" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["review_slug", "blocks"]);
      await reviewBlocksDB.syncReviewBlocks(env.DB, body.review_slug, body.blocks);
      return success();
    }

    // ==================================
    // SEO META CRUD
    // ==================================

    if (path === "/api/v1/seo/list") {
      const result = await seoMetaDB.getAllSeoMeta(env.DB);
      return json({ seo: result });
    }

    if (path === "/api/v1/seo/get" && request.method === "GET") {
      const url = new URL(request.url);
      const pageType = url.searchParams.get("page_type");
      const pageSlug = url.searchParams.get("page_slug");
      if (!pageType || !pageSlug) return failure("page_type and page_slug are required");
      const seo = await seoMetaDB.getSeoMeta(env.DB, pageType, pageSlug);
      return json({ seo: seo || null });
    }

    if (path === "/api/v1/seo/save" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["page_type", "page_slug"]);
      await seoMetaDB.upsertSeoMeta(env.DB, body);
      return success();
    }

    if (path === "/api/v1/seo/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["page_type", "page_slug"]);
      await seoMetaDB.deleteSeoMeta(env.DB, body.page_type, body.page_slug);
      return success();
    }
    // ==================================
    // AUTHORS CRUD
    // ==================================

    if (path === "/api/v1/authors/list") {
      const result = await authorsDB.getAllAuthorsAdmin(env.DB);
      return json({ authors: result });
    }

    if (path === "/api/v1/author/get" && request.method === "GET") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const author = await authorsDB.getAuthorById(env.DB, id);
      if (!author) return failure("Author not found", 404);
      return json({ success: true, author });
    }

    if (path === "/api/v1/author/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "name"]);
      const id = await authorsDB.createAuthor(env.DB, body);
      return json({ success: true, id });
    }

    if (path === "/api/v1/author/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "slug", "name"]);
      await authorsDB.updateAuthor(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/author/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await authorsDB.deleteAuthor(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/author/content" && request.method === "GET") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const content = await authorsDB.getAuthorContent(env.DB, id);
      const stats = await authorsDB.getAuthorStats(env.DB, id);
      return json({ content, stats });
    }
        // ==================================
    // CATEGORY GET BY ID (for edit)
    // ==================================

    if (path === "/api/v1/category/get-by-id" && request.method === "GET") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const { getCategoryById } = await import("./database/categories.js");
      const category = await getCategoryById(env.DB, id);
      if (!category) return failure("Category not found", 404);
      return json({ success: true, category });
    }

    // ==================================
    // COUNTRY GET BY ID (for edit)
    // ==================================

    if (path === "/api/v1/country/get-by-id" && request.method === "GET") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const { getCountryById } = await import("./database/countries.js");
      const country = await getCountryById(env.DB, id);
      if (!country) return failure("Country not found", 404);
      return json({ success: true, country });
    }

    if (path === "/api/v1/country/get-by-code" && request.method === "GET") {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      if (!code) return failure("code is required");
      const { getCountry } = await import("./database/countries.js");
      const country = await getCountry(env.DB, code.toUpperCase());
      if (!country) return failure("Country not found", 404);
      return json({ success: true, country });
    }
    // ==================================
    // MEDIA LIBRARY CRUD
    // ==================================

    if (path === "/api/v1/media/list") {
      const url = new URL(request.url);
      const folder = url.searchParams.get("folder");
      const result = await mediaDB.getAllMedia(env.DB, folder);
      return json({ media: result });
    }

    if (path === "/api/v1/media/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["filename", "url"]);
      const id = await mediaDB.createMedia(env.DB, {
        ...body,
        uploaded_by: user?.id || null
      });
      return json({ success: true, id });
    }

    if (path === "/api/v1/media/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await mediaDB.updateMedia(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/media/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await mediaDB.deleteMedia(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/media/folders") {
      const result = await mediaDB.getMediaFolders(env.DB);
      return json({ folders: result });
    }

    // ==================================
    // MEDIA LIBRARY — R2 UPLOAD & ENHANCED API (Phase 3)
    // All routes below use the same flat-if pattern, json/success/failure
    // helpers, and validate() as the rest of api.js.
    // Permission checks are handled by the existing resourceMap
    // ("/api/v1/media" → "media" resource) and action detection
    // (path ending in /create, /update, /delete).
    // ==================================

    // R2 file upload (multipart/form-data)
    // Permission: POST → "/api/v1/media" → "media" → "create"
    if (path === "/api/v1/media/upload" && request.method === "POST") {
      return await handleUpload(request, env, user);
    }

    // R2 file delete (removes from R2 bucket + D1 record)
    // Permission: POST → path ends with "/delete" → "media" → "delete"
    if (path === "/api/v1/media/r2/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      return await handleDelete(request, env, user, body.id);
    }

    // Enhanced media list with pagination, type filter, sort
    // Permission: GET → no write-method check needed
    if (path === "/api/v1/media/browse") {
      const url = new URL(request.url);
      const result = await listMedia(env, {
        type: url.searchParams.get("type") || null,
        folder: url.searchParams.get("folder") || null,
        uploaded_by: url.searchParams.get("uploaded_by") || null,
        limit: parseInt(url.searchParams.get("limit") || "50", 10),
        offset: parseInt(url.searchParams.get("offset") || "0", 10),
        sort: url.searchParams.get("sort") || "created_at",
        order: url.searchParams.get("order") || "DESC",
      });
      return json({ success: true, ...result });
    }

    // Media search by filename or alt text
    // Permission: GET → no write-method check needed
    if (path === "/api/v1/media/search") {
      const url = new URL(request.url);
      const query = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);
      if (!query.trim()) return json({ success: true, results: [] });
      const results = await searchMedia(env, query.trim(), limit, offset);
      return json({ success: true, results });
    }

    // Get single media item by ID
    // Permission: GET → no write-method check needed
    if (path === "/api/v1/media/get") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"), 10);
      if (!id) return failure("id is required");
      const media = await getMediaById(env, id);
      if (!media) return failure("Media not found", 404);
      return json({ success: true, media });
    }

    // Update media metadata (alt_text, caption, folder, type)
    // Permission: POST → path ends with "/update" → "media" → "update"
    if (path === "/api/v1/media/meta/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const updated = await updateMediaItem(env, body.id, {
        alt_text: body.alt_text,
        caption: body.caption,
        folder: body.folder,
        type: body.type,
      });
      if (!updated) return failure("Media not found or no changes", 404);
      return success();
    }

    // Enhanced folder tree for media library UI
    // Permission: GET → no write-method check needed
    if (path === "/api/v1/media/folders/tree") {
      const tree = await buildFolderTree(env);
      return json({ success: true, folders: tree });
    }

    // Folder create
    // Permission: POST → path ends with "/create" → "media" → "create"
    if (path === "/api/v1/media/folder/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name", "slug"]);
      const slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!slug) return failure("Invalid slug");
      const existing = await getFolderBySlug(env, slug);
      if (existing) return failure("A folder with this slug already exists", 409);
      const folder = await createFolder(env, body.name, slug, body.parent_id || null);
      return json({ success: true, folder });
    }

    // Folder rename
    // Permission: POST → path ends with "/update" → "media" → "update"
    if (path === "/api/v1/media/folder/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "name"]);
      const slug = (body.slug || body.name).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const existing = await getFolderBySlug(env, slug);
      if (existing && existing.id !== body.id) return failure("A folder with this slug already exists", 409);
      const updated = await updateFolder(env, body.id, body.name, slug);
      if (!updated) return failure("Folder not found", 404);
      return success();
    }

    // Folder delete
    // Permission: POST → path ends with "/delete" → "media" → "delete"
    if (path === "/api/v1/media/folder/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const folder = await getFolderById(env, body.id);
      if (!folder) return failure("Folder not found", 404);
      if (['general', 'logos', 'banners', 'reviews', 'news', 'pages', 'videos'].includes(folder.slug)) {
        return failure("Cannot delete default folders");
      }
      const deleted = await deleteFolder(env, body.id);
      if (!deleted) return failure("Folder not found", 404);
      return success();
    }

    // Count media in folder
    // Permission: GET → no write-method check needed
    if (path === "/api/v1/media/folder/count") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"), 10);
      if (!id) return failure("id is required");
      const folder = await getFolderById(env, id);
      if (!folder) return failure("Folder not found", 404);
      const count = await countMediaInFolder(env, folder.slug);
      return json({ success: true, count });
    }


    // ==================================
    // NAVIGATION CRUD
    // ==================================


    // ==================================
    // NAVIGATION CRUD
    // ==================================

    if (path === "/api/v1/nav/list") {
      const url = new URL(request.url);
      const location = url.searchParams.get("location");
      const result = location
        ? await navDB.getNavItems(env.DB, location)
        : await navDB.getAllNavItems(env.DB);
      return json({ nav: result });
    }

    if (path === "/api/v1/nav/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["label", "url", "location"]);

      // Reuse the existing URL sanitizer (sanitize.js) — blocks
      // javascript:/vbscript:/unsafe data: schemes while allowing
      // legitimate internal and external URLs. Applies to every
      // nav location (header/footer/mobile/page) equally.
      const safeUrl = sanitizeUrl(body.url, false);
      if (!safeUrl) {
        return failure("Invalid or unsafe URL");
      }
      body.url = safeUrl;

      const id = await navDB.createNavItem(env.DB, body);
      await invalidateNav(env);
      return json({ success: true, id });
    }

    if (path === "/api/v1/nav/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "label", "url", "location"]);

      const safeUrl = sanitizeUrl(body.url, false);
      if (!safeUrl) {
        return failure("Invalid or unsafe URL");
      }
      body.url = safeUrl;

      await navDB.updateNavItem(env.DB, body.id, body);
      await invalidateNav(env);
      return success();
    }

    if (path === "/api/v1/nav/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      // Explicit cleanup of any PageNav GEO rules for this item.
      // We do not rely solely on page_nav_geo_rules' ON DELETE
      // CASCADE foreign key, since D1's SQLite foreign-key
      // enforcement is not guaranteed in every environment. This
      // is a no-op for nav items with no GEO rules (i.e. every
      // existing header/footer/mobile item today), so it does not
      // change existing deletion behavior for those locations.
      await navDB.deletePageNavGeoRulesForItem(env.DB, body.id);

      await navDB.deleteNavItem(env.DB, body.id);
      await invalidateNav(env);
      return success();
    }

    // ==================================
    // PAGE NAV — GEO RULES CRUD
    // ==================================
    // Uses the same "nav" permission resource as the rest of
    // nav CRUD above (see resourceMap/readResourceMap) — no new
    // permission resource was introduced.

    if (path === "/api/v1/nav/geo/list") {
      const url = new URL(request.url);
      const navItemId = parseInt(url.searchParams.get("nav_item_id"), 10);

      if (!navItemId || navItemId <= 0) {
        return failure("A valid nav_item_id is required");
      }

      const rules = await navDB.getPageNavGeoRules(env.DB, navItemId);
      return json({ rules });
    }

    if (path === "/api/v1/nav/geo/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["nav_item_id", "country_code", "status"]);

      const navItemId = parseInt(body.nav_item_id, 10);
      if (!navItemId || navItemId <= 0) {
        return failure("A valid nav_item_id is required");
      }

      const existingItem = await env.DB.prepare(`
        SELECT id FROM nav_items WHERE id = ?
      `).bind(navItemId).first();
      if (!existingItem) {
        return failure("Nav item not found", 404);
      }

      const countryCode = String(body.country_code || "").trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(countryCode)) {
        return failure("country_code must be a 2-letter ISO country code (e.g. CA, NZ, GB)");
      }

      const status = String(body.status || "").trim().toLowerCase();
      const allowedStatuses = ["allowed", "blocked", "restricted"];
      if (!allowedStatuses.includes(status)) {
        return failure(`status must be one of: ${allowedStatuses.join(", ")}`);
      }

      const id = await navDB.createPageNavGeoRule(env.DB, {
        nav_item_id: navItemId,
        country_code: countryCode,
        status
      });

      await invalidateNav(env);

      return json({ success: true, id });
    }

    if (path === "/api/v1/nav/geo/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      await navDB.deletePageNavGeoRule(env.DB, body.id);
      await invalidateNav(env);

      return success();
    }

    // CURRENT USER PERMISSIONS
    // Returns only the authenticated user's effective permissions.
    // This is intentionally separate from /permissions/list,
    // which exposes the full permission matrix to authorized users.

    if (path === "/api/v1/user/permissions" && request.method === "GET") {
      return json({
        success: true,
        permissions: userPermissions || {}
      });
    }

    // ==================================
    // PERMISSIONS MANAGEMENT
    // ==================================

    if (path === "/api/v1/permissions/list") {
      const matrix = await permDB.getPermissionMatrix(env.DB);
      return json({ permissions: matrix });
    }

    if (path === "/api/v1/permissions/save" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["role", "resource", "action", "allowed"]);
      await permDB.setPermission(
        env.DB,
        body.role,
        body.resource,
        body.action,
        body.allowed
      );
      return success();
    }

    if (path === "/api/v1/permissions/bulk-save" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["role", "permissions"]);
      for (const perm of body.permissions) {
        await permDB.setPermission(
          env.DB,
          body.role,
          perm.resource,
          perm.action,
          perm.allowed
        );
      }
      return success();
    }

    // ==================================
    // ITEM-LEVEL ACCESS MANAGEMENT (admin only)
    // ==================================

    if (path === "/api/v1/admin/item-access/user" && request.method === "GET") {
      return handleGetUserItemAccess(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/set" && request.method === "POST") {
      return handleSetUserItemAccess(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/delete" && request.method === "POST") {
      return handleDeleteUserItemAccess(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/assign" && request.method === "POST") {
      return handleAssignItem(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/unassign" && request.method === "POST") {
      return handleUnassignItem(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/assignments" && request.method === "GET") {
      return handleGetUserAssignments(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/assignees" && request.method === "GET") {
      return handleGetItemAssignees(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/resources" && request.method === "GET") {
      return handleGetResources(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/default-scope" && request.method === "GET") {
      return handleGetDefaultScope(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/default-scope" && request.method === "POST") {
      return handleSetDefaultScope(request, env, user);
    }

    // ==================================
    // USER DASHBOARD — BOOKMARKS
    // ==================================

    if (path === "/api/v1/user/bookmarks" && request.method === "GET") {
      const bookmarks = await userDash.getBookmarks(env.DB, user.user_id);
      return json({ bookmarks });
    }

    if (path === "/api/v1/user/bookmark/add" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["casino_slug"]);
      await userDash.addBookmark(env.DB, user.user_id, body.casino_slug);
      return success();
    }

    if (path === "/api/v1/user/bookmark/remove" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["casino_slug"]);
      await userDash.removeBookmark(env.DB, user.user_id, body.casino_slug);
      return success();
    }

    // ==================================
    // USER DASHBOARD — INQUIRIES
    // ==================================

    if (path === "/api/v1/user/inquiries" && request.method === "GET") {
      const inquiries = await userDash.getInquiries(env.DB, user.user_id);
      return json({ inquiries });
    }

    if (path === "/api/v1/user/inquiry/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["subject", "message"]);
      const id = await userDash.createInquiry(env.DB, user.user_id, body.subject, body.message);
      return json({ success: true, id });
    }

    // ==================================
    // USER DASHBOARD — NOTIFICATIONS
    // ==================================

    if (path === "/api/v1/user/notifications" && request.method === "GET") {
      const notifications = await userDash.getNotifications(env.DB, user.user_id);
      return json({ notifications });
    }

    if (path === "/api/v1/user/notification/read" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await userDash.markNotificationRead(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/user/notifications/read-all" && request.method === "POST") {
      await userDash.markAllNotificationsRead(env.DB, user.user_id);
      return success();
    }

    // ==================================
    // USER DASHBOARD — CASINO SUBMISSIONS
    // ==================================

    if (path === "/api/v1/user/submissions" && request.method === "GET") {
      const submissions = await userDash.getSubmissions(env.DB, user.user_id);
      return json({ submissions });
    }

    if (path === "/api/v1/user/submit-casino" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name", "website_url"]);
      const id = await userDash.createSubmission(env.DB, user.user_id, body);
      return json({ success: true, id });
    }

    // ==================================
    // USER DASHBOARD — PROFILE
    // ==================================

    if (path === "/api/v1/user/profile" && request.method === "GET") {
      return json({
        user: {
          id: user.user_id,
          email: user.email,
          role: user.role
        }
      });
    }

    if (path === "/api/v1/user/profile/update" && request.method === "POST") {
      const body = await request.json();
      await userDash.updateUserProfile(env.DB, user.user_id, body);
      return success();
    }

    // ==================================
    // ADMIN — USER MANAGEMENT
    // ==================================

    if (path === "/api/v1/admin/users" && request.method === "GET") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const users = await adminTools.getAllUsers(env.DB);
      return json({ users });
    }

    if (path === "/api/v1/admin/user/update-role" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["id", "role"]);
      if (!["admin", "editor", "viewer"].includes(body.role)) {
        return failure("Invalid role. Must be admin, editor, or viewer");
      }
      await adminTools.updateUserRole(env.DB, body.id, body.role);
      return success();
    }

    if (path === "/api/v1/admin/user/delete" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["id"]);
      // Prevent self-deletion
      if (body.id === user.user_id) {
        return failure("Cannot delete your own account");
      }
      try {
        await adminTools.deleteUser(env.DB, body.id);
        return success();
      } catch (e) {
        return failure(e.message);
      }
    }

    // ==================================
    // ADMIN — SEND NOTIFICATIONS
    // ==================================

    if (path === "/api/v1/admin/notification/send" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["title", "target"]);

      let count = 0;
      if (body.target === "all") {
        validate(body, ["title", "message"]);
        count = await adminTools.sendNotificationToAll(env.DB, body.title, body.message, body.link || null);
      } else if (body.target === "role") {
        validate(body, ["title", "message", "role"]);
        count = await adminTools.sendNotificationToRole(env.DB, body.role, body.title, body.message, body.link || null);
      } else if (body.target === "user") {
        validate(body, ["title", "message", "user_id"]);
        await adminTools.sendNotificationToUser(env.DB, body.user_id, body.title, body.message, body.link || null);
        count = 1;
      } else {
        return failure("Invalid target. Use 'all', 'role', or 'user'");
      }
      return json({ success: true, sent: count });
    }

    // ==================================
    // ADMIN — SUBSCRIPTIONS (newsletter_subscribers)
    // ==================================

    if (path === "/api/v1/admin/subscribers" && request.method === "GET") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const url = new URL(request.url);
      const status = url.searchParams.get("status") || null;
      const search = url.searchParams.get("search") || null;
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;

      const [subscribers, counts] = await Promise.all([
        newsletterDB.listSubscribers(env.DB, { status, search, limit, offset }),
        newsletterDB.countSubscribersByStatus(env.DB)
      ]);
      return json({ subscribers, counts });
    }

    if (path === "/api/v1/admin/subscribers/add" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["email"]);
      const email = String(body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return failure("A valid email address is required");
      }
      await newsletterDB.adminAddSubscriber(env.DB, email);
      return success();
    }

    if (path === "/api/v1/admin/subscribers/unsubscribe" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["id"]);
      await newsletterDB.unsubscribeSubscriber(env.DB, body.id);
      return success();
    }

    // ==================================
    // ADMIN — EMAIL CAMPAIGNS (composer)
    // ==================================

    if (path === "/api/v1/admin/email-campaigns" && request.method === "GET") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const url = new URL(request.url);
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "30", 10) || 30, 100);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;
      const campaigns = await campaignDB.listCampaigns(env.DB, { limit, offset });
      return json({ campaigns });
    }

    if (path === "/api/v1/admin/email-campaigns/preview" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["recipientType"]);
      try {
        const count = await emailCampaigns.previewRecipientCount(env, {
          recipientType: body.recipientType,
          userIds: body.userIds || [],
          customEmails: body.customEmails || [],
          sinceDays: body.sinceDays || 7
        });
        return json({ success: true, count });
      } catch (e) {
        return failure(e.message);
      }
    }

    if (path === "/api/v1/admin/email-campaigns/send" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["subject", "bodyHtml", "recipientType"]);
      try {
        const result = await emailCampaigns.sendCampaign(env, request, {
          subject: body.subject,
          layout: body.layout || "branded",
          bodyHtml: body.bodyHtml,
          bodyText: body.bodyText || null,
          recipientType: body.recipientType,
          userIds: body.userIds || [],
          customEmails: body.customEmails || [],
          sinceDays: body.sinceDays || 7,
          createdByUserId: user.user_id
        });
        return json({ success: true, ...result });
      } catch (e) {
        return failure(e.message);
      }
    }

    // ==================================
    // ADMIN — SUBMISSION MANAGEMENT
    // ==================================

    if (path === "/api/v1/admin/submissions" && request.method === "GET") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const submissions = await userDash.getAllSubmissions(env.DB);
      return json({ submissions });
    }

    if (path === "/api/v1/admin/submission/update" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["id", "status"]);
      if (!["pending", "approved", "rejected"].includes(body.status)) {
        return failure("Invalid status. Use pending, approved, or rejected");
      }
      await userDash.updateSubmissionStatus(env.DB, body.id, body.status, body.admin_notes || null);

      // Notify the user about the status change
      const submission = await env.DB.prepare(
        "SELECT user_id, name FROM casino_submissions WHERE id = ?"
      ).bind(body.id).first();

      if (submission) {
        const statusMsg = body.status === "approved"
          ? `Your submission "${submission.name}" has been approved!`
          : `Your submission "${submission.name}" has been rejected.`;
        await adminTools.sendNotificationToUser(
          env.DB,
          submission.user_id,
          "Submission Update",
          body.admin_notes ? `${statusMsg} Note: ${body.admin_notes}` : statusMsg,
          "/en/user/submit-casino"
        );
      }
      return success();
    }

    // ==================================
    // ADMIN — INQUIRY MANAGEMENT
    // ==================================

    if (path === "/api/v1/admin/inquiries" && request.method === "GET") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const inquiries = await userDash.getAllInquiries(env.DB);
      return json({ inquiries });
    }

    if (path === "/api/v1/admin/inquiry/reply" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["id", "reply"]);
      await userDash.replyToInquiry(env.DB, body.id, body.reply);

      // Notify user
      const inquiry = await env.DB.prepare(
        "SELECT user_id, subject FROM user_inquiries WHERE id = ?"
      ).bind(body.id).first();

      if (inquiry) {
        await adminTools.sendNotificationToUser(
          env.DB,
          inquiry.user_id,
          "Inquiry Answered",
          `Your inquiry "${inquiry.subject}" has been answered.`,
          "/en/user/inquiries"
        );
      }
      return success();
    }

    // ==================================
    // AFFILIATE PARTNERS
    // ==================================

    if (path === "/api/v1/affiliate-partners/list") {
      const { condition, params } = await itemAccess.getAccessibleWhereClause(
        env.DB, user, 'affiliate_partners', 'read', ''
      );
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");

      const clauses = [];
      const bindParams = [...params];
      if (condition) clauses.push(condition);
      if (status) { clauses.push("status = ?"); bindParams.push(status); }
      if (search) { clauses.push("(name LIKE ? OR slug LIKE ?)"); bindParams.push(`%${search}%`, `%${search}%`); }

      const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : '';
      const result = await env.DB.prepare(
        `SELECT * FROM affiliate_partners ${whereClause} ORDER BY name ASC`
      ).bind(...bindParams).all();

      return json({ success: true, partners: result.results || [] });
    }

    if (path === "/api/v1/affiliate-partner/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const partner = await affiliatePartners.getPartnerById(env.DB, id);
      if (!partner) return failure("Partner not found", 404);

      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'affiliate_partners', 'read', partner);
      if (!canAccess) return failure("Partner not found", 404);

      partner.contacts = await affiliatePartners.getPartnerContacts(env.DB, id);
      return json({ success: true, partner });
    }

    if (path === "/api/v1/affiliate-partner/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name"]);

      body.slug = body.slug
        ? body.slug
        : await affiliatePartners.generateUniquePartnerSlug(env.DB, body.name);

      // SECURITY: ownership set server-side, never trust body.created_by
      body.created_by = user.user_id;
      const id = await affiliatePartners.createPartner(env.DB, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'create', entityType: 'affiliate_partner', entityId: id, metadata: { name: body.name, status: body.status || 'active' } });
      return success({ id });
    }

    if (path === "/api/v1/affiliate-partner/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "name"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_partners', body.id);
      if (!existing) return failure("Partner not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'affiliate_partners', 'update', existing);
      if (!canUpdate) return failure("Partner not found", 404);

      body.slug = body.slug || existing.slug;
      body.updated_by = user.user_id;
      await affiliatePartners.updatePartner(env.DB, body.id, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'affiliate_partner', entityId: body.id, metadata: { name: body.name, status: body.status, previous_status: existing.status } });
      return success();
    }

    if (path === "/api/v1/affiliate-partner/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_partners', body.id);
      if (!existing) return failure("Partner not found", 404);
      const canDelete = await itemAccess.canAccessItem(env.DB, user, 'affiliate_partners', 'delete', existing);
      if (!canDelete) return failure("Partner not found", 404);

      const dependents = await affiliatePartners.getPartnerDependents(env.DB, body.id);
      if (dependents) {
        return failure(
          `Cannot delete: this partner has ${dependents.programs} affiliate program(s) attached. ` +
          `Archive the partner instead, or remove the programs first.`,
          409
        );
      }
      const trackingDependents = await trackingLinksDB.getPartnerTrackingLinkDependents(env.DB, body.id);
      if (trackingDependents) {
        return failure(
          `Cannot delete: this partner has ${trackingDependents.tracking_links} tracking link(s) directly attached. ` +
          `Archive the partner instead, or remove those tracking links first.`,
          409
        );
      }

      await affiliatePartners.deletePartner(env.DB, body.id);
      await logAudit(env.DB, { userId: user.user_id, action: 'delete', entityType: 'affiliate_partner', entityId: body.id, metadata: { name: existing.name } });
      return success();
    }

    if (path === "/api/v1/affiliate-partner/contact/add" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["partner_id", "name"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_partners', body.partner_id);
      if (!existing) return failure("Partner not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'affiliate_partners', 'update', existing);
      if (!canUpdate) return failure("Partner not found", 404);

      const contactId = await affiliatePartners.addPartnerContact(env.DB, body.partner_id, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'create', entityType: 'affiliate_partner_contact', entityId: contactId, metadata: { partner_id: body.partner_id, name: body.name } });
      return success({ id: contactId });
    }

    if (path === "/api/v1/affiliate-partner/contact/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await affiliatePartners.deletePartnerContact(env.DB, body.id);
      await logAudit(env.DB, { userId: user.user_id, action: 'delete', entityType: 'affiliate_partner_contact', entityId: body.id });
      return success();
    }

    // ==================================
    // AFFILIATE PROGRAMS
    // ==================================

    if (path === "/api/v1/affiliate-programs/list") {
      const url = new URL(request.url);
      const partnerId = url.searchParams.get("partner_id") ? Number(url.searchParams.get("partner_id")) : null;
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");

      const programs = await affiliatePrograms.getAllProgramsAdmin(env.DB, { partnerId, status, search });
      return json({ success: true, programs });
    }

    if (path === "/api/v1/affiliate-program/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const program = await affiliatePrograms.getProgramById(env.DB, id);
      if (!program) return failure("Program not found", 404);

      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'affiliate_programs', 'read', program);
      if (!canAccess) return failure("Program not found", 404);

      program.casinos = await affiliatePrograms.getProgramCasinos(env.DB, id);
      return json({ success: true, program });
    }

    if (path === "/api/v1/affiliate-program/casinos" && request.method === "GET") {
      const url = new URL(request.url);
      const programId = Number(url.searchParams.get("program_id"));
      if (!programId) return failure("program_id is required");

      const casinoList = await affiliatePrograms.getProgramCasinos(env.DB, programId);
      return json({ success: true, casinos: casinoList });
    }

    // Reverse lookup: every program covering a given casino (used by
    // the Offer admin UI in System 2 to scope the program picker).
    if (path === "/api/v1/casino/affiliate-programs") {
      const url = new URL(request.url);
      const casinoId = Number(url.searchParams.get("casino_id"));
      if (!casinoId) return failure("casino_id is required");

      const programList = await affiliatePrograms.getCasinoPrograms(env.DB, casinoId);
      return json({ success: true, programs: programList });
    }

    if (path === "/api/v1/affiliate-program/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["partner_id", "name"]);

      const partner = await affiliatePartners.getPartnerById(env.DB, body.partner_id);
      if (!partner) return failure("Affiliate partner not found", 404);

      body.created_by = user.user_id;
      const id = await affiliatePrograms.createProgram(env.DB, body);

      if (Array.isArray(body.casino_ids)) {
        await affiliatePrograms.setProgramCasinos(env.DB, id, body.casino_ids);
      }
      await logAudit(env.DB, { userId: user.user_id, action: 'create', entityType: 'affiliate_program', entityId: id, metadata: { name: body.name, partner_id: body.partner_id, casino_ids: body.casino_ids || [] } });
      return success({ id });
    }

    if (path === "/api/v1/affiliate-program/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "name"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_programs', body.id);
      if (!existing) return failure("Program not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'affiliate_programs', 'update', existing);
      if (!canUpdate) return failure("Program not found", 404);

      body.updated_by = user.user_id;
      await affiliatePrograms.updateProgram(env.DB, body.id, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'affiliate_program', entityId: body.id, metadata: { name: body.name, status: body.status, previous_status: existing.status } });
      return success();
    }

    if (path === "/api/v1/affiliate-program/casinos/assign" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["program_id"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_programs', body.program_id);
      if (!existing) return failure("Program not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'affiliate_programs', 'update', existing);
      if (!canUpdate) return failure("Program not found", 404);

      await affiliatePrograms.setProgramCasinos(env.DB, body.program_id, body.casino_ids || []);
      await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'affiliate_program', entityId: body.program_id, metadata: { casino_ids: body.casino_ids || [] } });
      return success();
    }

    if (path === "/api/v1/affiliate-program/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_programs', body.id);
      if (!existing) return failure("Program not found", 404);
      const canDelete = await itemAccess.canAccessItem(env.DB, user, 'affiliate_programs', 'delete', existing);
      if (!canDelete) return failure("Program not found", 404);

      const dependents = await affiliatePrograms.getProgramDependents(env.DB, body.id);
      if (dependents) {
        const parts = Object.entries(dependents).map(([k, v]) => `${v} ${k}`).join(", ");
        return failure(
          `Cannot delete: this program has ${parts} attached. Archive it instead, or remove the dependents first.`,
          409
        );
      }
      const offerDependents = await offersDB.getProgramOfferDependents(env.DB, body.id);
      if (offerDependents) {
        return failure(
          `Cannot delete: this program has ${offerDependents.offers} offer(s) attached. Archive it instead, or remove those offers first.`,
          409
        );
      }
      const trackingDependents = await trackingLinksDB.getProgramTrackingLinkDependents(env.DB, body.id);
      if (trackingDependents) {
        return failure(
          `Cannot delete: this program has ${trackingDependents.tracking_links} tracking link(s) attached. Archive it instead, or remove those tracking links first.`,
          409
        );
      }

      await affiliatePrograms.deleteProgram(env.DB, body.id);
      await logAudit(env.DB, { userId: user.user_id, action: 'delete', entityType: 'affiliate_program', entityId: body.id, metadata: { name: existing.name } });
      return success();
    }

    // ==================================
    // AFFILIATE ACCOUNTS
    // ==================================

    if (path === "/api/v1/affiliate-accounts/list") {
      const url = new URL(request.url);
      const programId = url.searchParams.get("program_id") ? Number(url.searchParams.get("program_id")) : null;
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");

      const accountList = await affiliateAccounts.getAllAccountsAdmin(env.DB, { programId, status, search });
      return json({ success: true, accounts: accountList });
    }

    if (path === "/api/v1/affiliate-account/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const account = await affiliateAccounts.getAccountById(env.DB, id);
      if (!account) return failure("Account not found", 404);

      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'affiliate_accounts', 'read', account);
      if (!canAccess) return failure("Account not found", 404);

      return json({ success: true, account });
    }

    if (path === "/api/v1/affiliate-account/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["program_id", "account_name"]);

      const program = await affiliatePrograms.getProgramById(env.DB, body.program_id);
      if (!program) return failure("Affiliate program not found", 404);

      body.created_by = user.user_id;
      const id = await affiliateAccounts.createAccount(env.DB, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'create', entityType: 'affiliate_account', entityId: id, metadata: { account_name: body.account_name, program_id: body.program_id } });
      return success({ id });
    }

    if (path === "/api/v1/affiliate-account/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "account_name"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_accounts', body.id);
      if (!existing) return failure("Account not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'affiliate_accounts', 'update', existing);
      if (!canUpdate) return failure("Account not found", 404);

      body.updated_by = user.user_id;
      await affiliateAccounts.updateAccount(env.DB, body.id, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'affiliate_account', entityId: body.id, metadata: { account_name: body.account_name, status: body.status, previous_status: existing.status } });
      return success();
    }

    if (path === "/api/v1/affiliate-account/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_accounts', body.id);
      if (!existing) return failure("Account not found", 404);
      const canDelete = await itemAccess.canAccessItem(env.DB, user, 'affiliate_accounts', 'delete', existing);
      if (!canDelete) return failure("Account not found", 404);

      const dependents = await affiliateAccounts.getAccountDependents(env.DB, body.id);
      if (dependents) {
        return failure(
          `Cannot delete: this account has ${dependents.commercial_terms} commercial term(s) attached. ` +
          `Archive it instead, or remove the terms first.`,
          409
        );
      }

      await affiliateAccounts.deleteAccount(env.DB, body.id);
      await logAudit(env.DB, { userId: user.user_id, action: 'delete', entityType: 'affiliate_account', entityId: body.id, metadata: { account_name: existing.account_name } });
      return success();
    }

    // ==================================
    // COMMERCIAL TERMS
    // ==================================

    if (path === "/api/v1/commercial-terms/list" || path === "/api/v1/commercial-terms/history") {
      const url = new URL(request.url);
      const programId = Number(url.searchParams.get("program_id"));
      if (!programId) return failure("program_id is required");

      const accountId = url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null;
      const casinoId = url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null;

      const terms = await commercialTerms.getTermHistory(env.DB, { programId, accountId, casinoId });
      return json({ success: true, terms });
    }

    if (path === "/api/v1/commercial-terms/resolve") {
      const url = new URL(request.url);
      const programId = Number(url.searchParams.get("program_id"));
      if (!programId) return failure("program_id is required");

      const accountId = url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null;
      const casinoId = url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null;
      const geoCode = url.searchParams.get("geo_code") || null;
      const onDate = url.searchParams.get("date") || null;

      const term = await commercialTerms.resolveApplicableTerm(env.DB, { programId, accountId, casinoId, geoCode, onDate });
      return json({ success: true, term });
    }

    if (path === "/api/v1/commercial-term/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const term = await commercialTerms.getTermById(env.DB, id);
      if (!term) return failure("Commercial term not found", 404);

      return json({ success: true, term });
    }

    if (path === "/api/v1/commercial-term/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["program_id", "term_type", "effective_date"]);

      const program = await affiliatePrograms.getProgramById(env.DB, body.program_id);
      if (!program) return failure("Affiliate program not found", 404);

      body.created_by = user.user_id;
      try {
        const id = await commercialTerms.createCommercialTerm(env.DB, body);
        await logAudit(env.DB, {
          userId: user.user_id,
          action: 'create',
          entityType: 'commercial_term',
          entityId: id,
          metadata: {
            program_id: body.program_id, account_id: body.account_id ?? null,
            casino_id: body.casino_id ?? null, geo_code: body.geo_code ?? null,
            term_type: body.term_type, effective_date: body.effective_date
          }
        });
        return success({ id });
      } catch (error) {
        // Overlap conflicts and field-validation errors are client
        // errors, not server errors -- surface them as 409/422 rather
        // than falling into the generic 500 catch below.
        const isOverlap = /already covers this exact scope/.test(error.message);
        return failure(error.message, isOverlap ? 409 : 422);
      }
    }

    if (path === "/api/v1/commercial-term/supersede" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await commercialTerms.getTermById(env.DB, body.id);
      if (!existing) return failure("Commercial term not found", 404);

      await commercialTerms.supersedeTerm(env.DB, body.id, body.expiry_date || null);
      await logAudit(env.DB, { userId: user.user_id, action: 'supersede', entityType: 'commercial_term', entityId: body.id, metadata: { program_id: existing.program_id, term_type: existing.term_type } });
      return success();
    }

    // ==================================
    // POSTBACK INTEGRATIONS (brief §4-6, §21, §25)
    // Admin-only -- see readResourceMap/resourceMap above and
    // migration 0033 (no editor permission rows exist for this
    // resource at all, so a non-admin gets a 403 regardless of role).
    // ==================================

    if (path === "/api/v1/postback-configs/list") {
      const url = new URL(request.url);
      const accountId = url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null;
      const status = url.searchParams.get("status") || null;
      const configs = await postbackConfigsDB.listPostbackConfigs(env.DB, { accountId, status });
      return json({ success: true, configs });
    }

    if (path === "/api/v1/postback-config/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const config = await postbackConfigsDB.getPostbackConfigById(env.DB, id);
      if (!config) return failure("Postback config not found", 404);
      return json({ success: true, config });
    }

    if (path === "/api/v1/postback-config/health") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const health = await postbackConfigsDB.getConversionHealth(env.DB, id);
      return json({ success: true, health });
    }

    if (path === "/api/v1/postback-config/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["account_id", "label", "auth_method", "credential_reference"]);

      const account = await affiliateAccounts.getAccountById(env.DB, body.account_id);
      if (!account) return failure("Affiliate account not found", 404);

      body.created_by = user.user_id;
      try {
        const { id, endpoint_token } = await postbackConfigsDB.createPostbackConfig(env.DB, body);
        await logAudit(env.DB, {
          userId: user.user_id, action: 'create', entityType: 'postback_config', entityId: id,
          // Never the credential value -- only which pointer/account it's for.
          metadata: { account_id: body.account_id, auth_method: body.auth_method, credential_reference: body.credential_reference }
        });
        // endpoint_token is returned once here so the admin can hand
        // it to the network -- it is a URL path segment, not the
        // credential itself, but is still only ever shown through this
        // authenticated admin API, never a public response.
        return success({ id, endpoint_token });
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/postback-config/update" && request.method === "PUT") {
      const body = await request.json();
      validate(body, ["id", "account_id", "label", "auth_method", "credential_reference"]);

      const existing = await postbackConfigsDB.getPostbackConfigById(env.DB, body.id);
      if (!existing) return failure("Postback config not found", 404);

      body.updated_by = user.user_id;
      try {
        await postbackConfigsDB.updatePostbackConfig(env.DB, body.id, body);
        await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'postback_config', entityId: body.id, metadata: { account_id: body.account_id, auth_method: body.auth_method } });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/postback-config/rotate-token" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const existing = await postbackConfigsDB.getPostbackConfigById(env.DB, body.id);
      if (!existing) return failure("Postback config not found", 404);

      const endpoint_token = await postbackConfigsDB.rotateEndpointToken(env.DB, body.id, user.user_id);
      await logAudit(env.DB, { userId: user.user_id, action: 'rotate_token', entityType: 'postback_config', entityId: body.id });
      return success({ endpoint_token });
    }

    if (path === "/api/v1/postback-config/archive" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const existing = await postbackConfigsDB.getPostbackConfigById(env.DB, body.id);
      if (!existing) return failure("Postback config not found", 404);

      await postbackConfigsDB.archivePostbackConfig(env.DB, body.id, user.user_id);
      await logAudit(env.DB, { userId: user.user_id, action: 'archive', entityType: 'postback_config', entityId: body.id });
      return success();
    }

    // The postback testing UI (brief §25): runs the EXACT same
    // ingestPostback() pipeline the live endpoint uses, in dry-run
    // mode (never inserts a conversion row), and returns the same
    // per-step resolution breakdown the admin dashboard's "Test
    // Postback" screen renders as a checklist.
    if (path === "/api/v1/postback-config/test" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const config = await postbackConfigsDB.getPostbackConfigById(env.DB, body.id);
      if (!config) return failure("Postback config not found", 404);

      const normalized = normalizeConversionPayload(body.payload || {}, config.field_mapping_json);
      const validation = validateNormalized(normalized);
      if (!validation.valid) {
        return json({ success: true, outcome: "rejected_validation", errors: validation.errors }, 200);
      }

      const result = await ingestPostback(env.DB, { config, normalized, dryRun: true });
      return json({ success: true, ...result });
    }

    // ==================================
    // CONVERSION REPORT IMPORTS (brief §11)
    // Editor+ (see migration 0034 permissions) -- unlike
    // postback_configs this holds no credentials, so it follows the
    // same tier as tracking_links/offers rather than admin-only.
    // ==================================

    if (path === "/api/v1/imports/list") {
      const url = new URL(request.url);
      const accountId = url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null;
      const batches = await importBatchesDB.listImportBatches(env.DB, { accountId });
      return json({ success: true, batches });
    }

    if (path === "/api/v1/import/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const batch = await importBatchesDB.getImportBatchById(env.DB, id);
      if (!batch) return failure("Import batch not found", 404);
      return json({ success: true, batch: { ...batch, errors: batch.errors_json ? JSON.parse(batch.errors_json) : [] } });
    }

    if (path === "/api/v1/imports/conversions" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["account_id", "format", "content"]);

      const account = await affiliateAccounts.getAccountById(env.DB, body.account_id);
      if (!account) return failure("Affiliate account not found", 404);
      if (!["csv", "json"].includes(body.format)) return failure('format must be "csv" or "json"');

      let rows;
      try {
        rows = body.format === "csv" ? parseCsv(body.content) : parseJsonRows(body.content);
      } catch (error) {
        return failure(`Could not parse ${body.format.toUpperCase()} content: ${error.message}`, 422);
      }
      if (!rows.length) return failure("No rows found in the provided content", 422);

      const result = await importConversionReport(env.DB, {
        accountId: body.account_id,
        rows,
        format: body.format,
        fieldMapping: body.field_mapping || null,
        label: body.label || null,
        createdBy: user.user_id
      });

      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "import_batch", entityId: result.batchId,
        metadata: { account_id: body.account_id, format: body.format, total_rows: result.totalRows, imported: result.importedCount, errors: result.errorCount }
      });

      return json({ success: true, ...result });
    }

    // ==================================
    // PROVIDER API ADAPTERS (brief §10) -- outbound pull integrations.
    // Admin-only, same reasoning as postback_configs (holds a
    // credential_reference pointer).
    // ==================================

    if (path === "/api/v1/provider-adapters/list") {
      const url = new URL(request.url);
      const accountId = url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null;
      const configs = await providerAdaptersDB.listProviderAdapterConfigs(env.DB, { accountId });
      return json({ success: true, configs, available_providers: listProviderKeys() });
    }

    if (path === "/api/v1/provider-adapter/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const config = await providerAdaptersDB.getProviderAdapterConfigById(env.DB, id);
      if (!config) return failure("Provider adapter config not found", 404);
      return json({ success: true, config });
    }

    if (path === "/api/v1/provider-adapter/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["account_id", "label", "provider_key", "api_base_url", "credential_reference"]);
      const account = await affiliateAccounts.getAccountById(env.DB, body.account_id);
      if (!account) return failure("Affiliate account not found", 404);

      body.created_by = user.user_id;
      try {
        const id = await providerAdaptersDB.createProviderAdapterConfig(env.DB, body);
        await logAudit(env.DB, { userId: user.user_id, action: 'create', entityType: 'provider_adapter_config', entityId: id, metadata: { account_id: body.account_id, provider_key: body.provider_key, credential_reference: body.credential_reference } });
        return success({ id });
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/provider-adapter/update" && request.method === "PUT") {
      const body = await request.json();
      validate(body, ["id", "account_id", "label", "provider_key", "api_base_url", "credential_reference"]);
      const existing = await providerAdaptersDB.getProviderAdapterConfigById(env.DB, body.id);
      if (!existing) return failure("Provider adapter config not found", 404);

      body.updated_by = user.user_id;
      try {
        await providerAdaptersDB.updateProviderAdapterConfig(env.DB, body.id, body);
        await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'provider_adapter_config', entityId: body.id, metadata: { account_id: body.account_id, provider_key: body.provider_key } });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/provider-adapter/archive" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const existing = await providerAdaptersDB.getProviderAdapterConfigById(env.DB, body.id);
      if (!existing) return failure("Provider adapter config not found", 404);
      await providerAdaptersDB.archiveProviderAdapterConfig(env.DB, body.id, user.user_id);
      await logAudit(env.DB, { userId: user.user_id, action: 'archive', entityType: 'provider_adapter_config', entityId: body.id });
      return success();
    }

    // Manual "sync now" -- runs the real adapter (a genuine outbound
    // network call, unlike the postback test tool's dry run) so an
    // admin can verify a freshly-configured integration works without
    // waiting for the cron window. Still respects the feature flag's
    // SPIRIT even though it bypasses the flag itself: it only ever
    // touches the ONE config the admin explicitly requested, not every
    // due config the way the cron job would.
    if (path === "/api/v1/provider-adapter/sync-now" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const config = await providerAdaptersDB.getProviderAdapterConfigById(env.DB, body.id);
      if (!config) return failure("Provider adapter config not found", 404);
      if (config.status !== "active") return failure("Cannot sync a disabled integration", 422);

      const result = await syncProviderConfig(env.DB, env, config);
      await cronHealthDB.recordCronRun(env.DB, 'provider_sync', { skipped: false, synced: 1 });
      await logAudit(env.DB, { userId: user.user_id, action: 'sync_now', entityType: 'provider_adapter_config', entityId: body.id, metadata: { ok: result.ok, imported: result.importedCount } });
      return json({ success: true, ...result });
    }

    // ==================================
    // OFFERS
    // ==================================

    if (path === "/api/v1/offers/list") {
      const url = new URL(request.url);
      const casinoId = url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null;
      const programId = url.searchParams.get("program_id") ? Number(url.searchParams.get("program_id")) : null;
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");

      const offerList = await offersDB.getAllOffersAdmin(env.DB, { casinoId, programId, status, search });
      return json({ success: true, offers: offerList });
    }

    if (path === "/api/v1/offer/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const offer = await offersDB.getOfferById(env.DB, id);
      if (!offer) return failure("Offer not found", 404);

      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'offers', 'read', offer);
      if (!canAccess) return failure("Offer not found", 404);

      return json({ success: true, offer });
    }

    if (path === "/api/v1/offer/history") {
      const url = new URL(request.url);
      const offerId = Number(url.searchParams.get("offer_id"));
      if (!offerId) return failure("offer_id is required");

      const history = await offersDB.getOfferVersionHistory(env.DB, offerId);
      return json({ success: true, history });
    }

    if (path === "/api/v1/offer/as-of") {
      const url = new URL(request.url);
      const offerId = Number(url.searchParams.get("offer_id"));
      const date = url.searchParams.get("date");
      if (!offerId || !date) return failure("offer_id and date are required");

      const snapshot = await offersDB.getOfferAsOfDate(env.DB, offerId, date);
      return json({ success: true, offer: snapshot });
    }

    // Admin eligibility preview: every active candidate for a casino,
    // in priority order -- lets an admin see the full ranking, not
    // just the single winner resolve() would return.
    if (path === "/api/v1/offer/candidates") {
      const url = new URL(request.url);
      const casinoId = Number(url.searchParams.get("casino_id"));
      if (!casinoId) return failure("casino_id is required");

      const candidates = await getCandidateOffers(env.DB, casinoId);
      return json({ success: true, candidates });
    }

    // Admin testing tool: preview exactly what a visitor from a given
    // country would see for a casino, using the real selection service
    // (the same one the public site will use) -- not a separate mock.
    if (path === "/api/v1/offer/resolve") {
      const url = new URL(request.url);
      const casinoSlug = url.searchParams.get("casino_slug");
      const countryCode = url.searchParams.get("country_code");
      if (!casinoSlug || !countryCode) return failure("casino_slug and country_code are required");

      const result = await resolveOfferForCasino(env.DB, { casinoSlug, countryCode: countryCode.toUpperCase() });
      return json({ success: true, ...result });
    }

    if (path === "/api/v1/offer/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["casino_id", "offer_type", "internal_name"]);

      const casino = await env.DB.prepare(`SELECT id FROM casinos WHERE id = ?`).bind(body.casino_id).first();
      if (!casino) return failure("Casino not found", 404);

      body.created_by = user.user_id;
      try {
        const id = await offersDB.createOffer(env.DB, body);
        await logAudit(env.DB, {
          userId: user.user_id, action: 'create', entityType: 'offer', entityId: id,
          metadata: { casino_id: body.casino_id, offer_type: body.offer_type, internal_name: body.internal_name, status: body.status || 'draft' }
        });
        return success({ id });
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/offer/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, 'offers', body.id);
      if (!existing) return failure("Offer not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'offers', 'update', existing);
      if (!canUpdate) return failure("Offer not found", 404);

      try {
        await offersDB.updateOffer(env.DB, body.id, body, { changedBy: user.user_id, changeReason: body.change_reason || null });
        await logAudit(env.DB, {
          userId: user.user_id, action: 'update', entityType: 'offer', entityId: body.id,
          metadata: { previous_status: existing.status, new_status: body.status || existing.status }
        });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/offer/status/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "status"]);

      const existing = await itemAccess.getItemById(env.DB, 'offers', body.id);
      if (!existing) return failure("Offer not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'offers', 'update', existing);
      if (!canUpdate) return failure("Offer not found", 404);

      try {
        await offersDB.transitionOfferStatus(env.DB, body.id, body.status, { changedBy: user.user_id, changeReason: body.change_reason || null });
        await logAudit(env.DB, {
          userId: user.user_id, action: 'status_change', entityType: 'offer', entityId: body.id,
          metadata: { from: existing.status, to: body.status, reason: body.change_reason || null }
        });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }


    // ==================================
    // TRACKING LINKS
    // ==================================

    if (path === "/api/v1/tracking-links/list") {
      const url = new URL(request.url);
      const casinoId = url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null;
      const status = url.searchParams.get("status");
      const healthStatus = url.searchParams.get("health_status");
      const search = url.searchParams.get("search");

      const links = await trackingLinksDB.getAllTrackingLinksAdmin(env.DB, { casinoId, status, healthStatus, search });
      return json({ success: true, tracking_links: links });
    }

    if (path === "/api/v1/tracking-link/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const link = await trackingLinksDB.getTrackingLinkById(env.DB, id);
      if (!link) return failure("Tracking link not found", 404);

      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'tracking_links', 'read', link);
      if (!canAccess) return failure("Tracking link not found", 404);

      link.geo_destinations = await trackingLinksDB.getGeoDestinations(env.DB, id);
      return json({ success: true, tracking_link: link });
    }

    if (path === "/api/v1/tracking-link/geo-destinations" && request.method === "GET") {
      const url = new URL(request.url);
      const linkId = Number(url.searchParams.get("tracking_link_id"));
      if (!linkId) return failure("tracking_link_id is required");

      const destinations = await trackingLinksDB.getGeoDestinations(env.DB, linkId);
      return json({ success: true, geo_destinations: destinations });
    }

    if (path === "/api/v1/tracking-link/health-history") {
      const url = new URL(request.url);
      const linkId = Number(url.searchParams.get("tracking_link_id"));
      if (!linkId) return failure("tracking_link_id is required");

      const result = await env.DB.prepare(`
        SELECT * FROM tracking_link_health_checks WHERE tracking_link_id = ? ORDER BY checked_at DESC LIMIT 50
      `).bind(linkId).all();
      return json({ success: true, history: result.results || [] });
    }

    // Admin testing tool: preview exactly what /en/go/:identifier would
    // do for a given country, using the REAL resolution service --
    // not a separate mock of the redirect logic.
    if (path === "/api/v1/tracking-link/resolve-preview") {
      const url = new URL(request.url);
      const identifier = url.searchParams.get("identifier");
      const countryCode = url.searchParams.get("country_code");
      if (!identifier || !countryCode) return failure("identifier and country_code are required");

      const result = await resolveRedirectTarget(env.DB, { identifier, countryCode: countryCode.toUpperCase() });
      return json({ success: true, ...result });
    }

    if (path === "/api/v1/tracking-link/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["internal_name", "destination_url"]);

      body.created_by = user.user_id;
      const ownDomains = [new URL(request.url).hostname];
      try {
        const created = await trackingLinksDB.createTrackingLink(env.DB, body, { ownDomains });
        await logAudit(env.DB, {
          userId: user.user_id, action: 'create', entityType: 'tracking_link', entityId: created.id,
          metadata: { tracking_code: created.tracking_code, casino_id: body.casino_id ?? null, destination_url: body.destination_url }
        });
        return success(created);
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/tracking-link/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, 'tracking_links', body.id);
      if (!existing) return failure("Tracking link not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'tracking_links', 'update', existing);
      if (!canUpdate) return failure("Tracking link not found", 404);

      body.updated_by = user.user_id;
      const ownDomains = [new URL(request.url).hostname];
      try {
        await trackingLinksDB.updateTrackingLink(env.DB, body.id, body, { ownDomains });
        await logAudit(env.DB, {
          userId: user.user_id, action: 'update', entityType: 'tracking_link', entityId: body.id,
          metadata: { internal_name: body.internal_name || existing.internal_name }
        });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/tracking-link/status/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "status"]);

      const existing = await itemAccess.getItemById(env.DB, 'tracking_links', body.id);
      if (!existing) return failure("Tracking link not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'tracking_links', 'update', existing);
      if (!canUpdate) return failure("Tracking link not found", 404);

      try {
        await trackingLinksDB.setLinkStatus(env.DB, body.id, body.status, user.user_id);
        await logAudit(env.DB, {
          userId: user.user_id, action: 'status_change', entityType: 'tracking_link', entityId: body.id,
          metadata: { from: existing.status, to: body.status }
        });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/tracking-link/geo-destinations/assign" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["tracking_link_id"]);

      const existing = await itemAccess.getItemById(env.DB, 'tracking_links', body.tracking_link_id);
      if (!existing) return failure("Tracking link not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'tracking_links', 'update', existing);
      if (!canUpdate) return failure("Tracking link not found", 404);

      const ownDomains = [new URL(request.url).hostname];
      try {
        await trackingLinksDB.setGeoDestinations(env.DB, body.tracking_link_id, body.destinations || [], { ownDomains });
        await logAudit(env.DB, {
          userId: user.user_id, action: 'update', entityType: 'tracking_link', entityId: body.tracking_link_id,
          metadata: { geo_destinations_count: (body.destinations || []).length }
        });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    // Manual, admin-triggered health check -- the ONLY place a health
    // check is allowed to run synchronously within a request, since
    // it's an explicit one-off admin action, not a visitor redirect.
    if (path === "/api/v1/tracking-link/health-check/run" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const link = await trackingLinksDB.getTrackingLinkById(env.DB, body.id);
      if (!link) return failure("Tracking link not found", 404);
      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'tracking_links', 'read', link);
      if (!canAccess) return failure("Tracking link not found", 404);

      const result = await checkAndRecordLink(env.DB, link);
      await logAudit(env.DB, {
        userId: user.user_id, action: 'health_check', entityType: 'tracking_link', entityId: body.id,
        metadata: { health_status: result.healthStatus, http_status: result.httpStatus }
      });
      return json({ success: true, result });
    }

        // ==================================
    // ANALYTICS / REPORTING (Phase 5)
    // ==================================
    // Read endpoints are gated by the "analytics" / "analytics_conversions"
    // resource via readResourceMap above (role-level check, already run
    // before this point in handleAPI). Item-access scoping happens INSIDE
    // analyticsDB — every query below resolves the caller's accessible
    // dimension IDs before aggregating (see worker/database/analytics.js
    // header comment). No handler here re-derives or bypasses that.

    if (path === "/api/v1/analytics/overview") {
      const url = new URL(request.url);
      const dimensionType = url.searchParams.get("dimension_type") || "casino";
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");
      const currency = url.searchParams.get("currency") || null;
      if (!startDate || !endDate) return failure("start_date and end_date are required");

      const rows = await analyticsDB.getDimensionPerformance(env.DB, user, {
        dimensionType, startDate, endDate, currency
      });
      return json({ success: true, dimension_type: dimensionType, rows });
    }

    if (path === "/api/v1/analytics/timeseries") {
      const url = new URL(request.url);
      const dimensionType = url.searchParams.get("dimension_type") || "casino";
      const dimensionId = url.searchParams.get("dimension_id") ? Number(url.searchParams.get("dimension_id")) : null;
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");
      const currency = url.searchParams.get("currency") || null;
      if (!startDate || !endDate) return failure("start_date and end_date are required");

      const series = await analyticsDB.getTimeSeries(env.DB, user, {
        dimensionType, dimensionId, startDate, endDate, currency
      });
      return json({ success: true, series });
    }

    if (path === "/api/v1/analytics/geo") {
      const url = new URL(request.url);
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");
      const currency = url.searchParams.get("currency") || null;
      if (!startDate || !endDate) return failure("start_date and end_date are required");

      const rows = await analyticsDB.getGeoPerformance(env.DB, user, { startDate, endDate, currency });
      return json({ success: true, rows });
    }

    // Cron/scheduled-job health -- diagnoses the exact failure mode
    // that produces "the dashboard shows zero" support requests:
    // 'never_run' means the Worker's scheduled() trigger itself has
    // never fired (check wrangler.jsonc's triggers.crons), 'disabled'
    // means it fires but the job's own feature flag is off, 'stale'
    // means it was working and appears to have stopped. Read-only,
    // same 'analytics' resource as overview/timeseries/geo above.
    if (path === "/api/v1/analytics/cron-health") {
      const health = await cronHealthDB.getCronHealth(env.DB);
      return json({ success: true, jobs: health });
    }

    // Manual/backfill aggregation run -- admin-only (editor:analytics:create
    // is 0 by default, see migration 0027), because this writes
    // analytics_daily rows across EVERY casino/offer/etc. at once,
    // ignoring the calling user's own item-access scope entirely (the
    // aggregation itself has to see everything to produce correct
    // tenant-wide rollups; per-user scoping happens later, at read
    // time, in getDimensionPerformance/getGeoPerformance). Deliberately
    // does NOT require 'analytics_aggregation_cron_enabled' to be on --
    // see backfillAnalyticsDaily()'s own header comment for why a
    // manual admin action shouldn't depend on the automation flag.
    if (path === "/api/v1/analytics/aggregate-now" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["start_date", "end_date"]);
      try {
        const result = await analyticsDB.backfillAnalyticsDaily(env.DB, { startDate: body.start_date, endDate: body.end_date });
        await cronHealthDB.recordCronRun(env.DB, 'analytics_aggregation', { skipped: false, date: `${body.start_date} to ${body.end_date}`, daysProcessed: result.daysProcessed });
        await logAudit(env.DB, { userId: user.user_id, action: 'run', entityType: 'analytics_aggregation', metadata: { start_date: body.start_date, end_date: body.end_date, days_processed: result.daysProcessed } });
        return json({ success: true, ...result });
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    // Manual alert-rule evaluation -- same "explicit admin action
    // doesn't need the automation flag on" reasoning as aggregate-now
    // above. Also updates the SAME cron-health row the scheduled path
    // writes to, so /dashboard/analytics System Health reflects manual
    // activity too, not only cron ticks.
    if (path === "/api/v1/analytics/alerts/evaluate-now" && request.method === "POST") {
      const result = await alertsDB.evaluateAllRulesNow(env.DB);
      await cronHealthDB.recordCronRun(env.DB, 'alert_evaluation', { skipped: false, summary: result.summary });
      await logAudit(env.DB, { userId: user.user_id, action: 'run', entityType: 'alert_evaluation', metadata: { evaluated: result.evaluated, triggered: result.summary.filter(s => s.triggered).length } });
      return json({ success: true, ...result });
    }

    // Manual scheduled-report run -- same reasoning. Only picks up
    // schedules that are ACTUALLY due right now (next_run_at <= now),
    // so this can't be used to force an early run of something not
    // due yet -- it just stops waiting on a disabled cron for what's
    // already due.
    if (path === "/api/v1/analytics/reports/run-due-now" && request.method === "POST") {
      const result = await reportsDB.runDueReportSchedulesNow(env.DB, env);
      await cronHealthDB.recordCronRun(env.DB, 'report_schedules', { skipped: false, results: result.summary });
      await logAudit(env.DB, { userId: user.user_id, action: 'run', entityType: 'report_schedules', metadata: { processed: result.processed } });
      return json({ success: true, ...result });
    }

    // Records a partner-reported conversion. Never accepts a caller-
    // supplied commission figure — recordConversion() looks up the
    // applicable affiliate_commercial_terms row itself. This is an
    // internal/admin-triggered entry point (e.g. manual postback
    // reconciliation); an unauthenticated public postback endpoint is
    // a separate, not-yet-built concern (would need its own signature
    // verification, distinct from session auth) and is intentionally
    // out of scope here.
    if (path === "/api/v1/analytics/conversion/record" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["programId", "conversionType"]);

      const created = await analyticsDB.recordConversion(env.DB, {
        clickId: body.clickId ?? null,
        trackingLinkId: body.trackingLinkId ?? null,
        offerId: body.offerId ?? null,
        casinoId: body.casinoId ?? null,
        partnerId: body.partnerId ?? null,
        programId: body.programId,
        accountId: body.accountId ?? null,
        campaignId: body.campaignId ?? null,
        conversionType: body.conversionType,
        reportedValue: body.reportedValue ?? null,
        currency: body.currency || "USD",
        countryCode: body.countryCode ?? null,
        externalReference: body.externalReference ?? null,
        createdBy: user.user_id
      });
      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "analytics_conversion",
        entityId: created?.meta?.last_row_id ?? null,
        metadata: { conversion_type: body.conversionType, program_id: body.programId }
      });
      return json({ success: true });
    }

    // ==================================
    // CAMPAIGNS (Phase 10)
    // ==================================

    if (path === "/api/v1/campaigns/list") {
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      const { condition, params } = await itemAccess.getAccessibleWhereClause(env.DB, user, "campaigns", "read");
      const statusClause = status ? "AND status = ?" : "";
      const result = await env.DB.prepare(`
        SELECT * FROM campaigns
        WHERE 1=1 ${condition ? "AND " + condition : ""} ${statusClause}
        ORDER BY created_at DESC
      `).bind(...params, ...(status ? [status] : [])).all();
      return json({ success: true, campaigns: result.results || [] });
    }

    if (path === "/api/v1/campaign/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const campaign = await itemAccess.getItemById(env.DB, "campaigns", id);
      if (!campaign) return failure("Campaign not found", 404);
      const canAccess = await itemAccess.canAccessItem(env.DB, user, "campaigns", "read", campaign);
      if (!canAccess) return failure("Campaign not found", 404);

      return json({ success: true, campaign });
    }

    if (path === "/api/v1/campaign/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name"]);

      const result = await env.DB.prepare(`
        INSERT INTO campaigns (name, utm_source, utm_medium, utm_campaign, utm_term, utm_content, status, start_date, end_date, notes, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        body.name, body.utmSource ?? null, body.utmMedium ?? null, body.utmCampaign ?? null,
        body.utmTerm ?? null, body.utmContent ?? null, body.status || "active",
        body.startDate ?? null, body.endDate ?? null, body.notes ?? null,
        user.user_id, user.user_id
      ).run();

      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "campaign",
        entityId: result.meta.last_row_id, metadata: { name: body.name }
      });
      return json({ success: true, id: result.meta.last_row_id });
    }

    if (path === "/api/v1/campaign/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, "campaigns", body.id);
      if (!existing) return failure("Campaign not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, "campaigns", "update", existing);
      if (!canUpdate) return failure("Campaign not found", 404);

      await env.DB.prepare(`
        UPDATE campaigns SET
          name = ?, utm_source = ?, utm_medium = ?, utm_campaign = ?, utm_term = ?, utm_content = ?,
          status = ?, start_date = ?, end_date = ?, notes = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        body.name ?? existing.name, body.utmSource ?? existing.utm_source, body.utmMedium ?? existing.utm_medium,
        body.utmCampaign ?? existing.utm_campaign, body.utmTerm ?? existing.utm_term, body.utmContent ?? existing.utm_content,
        body.status ?? existing.status, body.startDate ?? existing.start_date, body.endDate ?? existing.end_date,
        body.notes ?? existing.notes, user.user_id, body.id
      ).run();

      await logAudit(env.DB, {
        userId: user.user_id, action: "update", entityType: "campaign", entityId: body.id, metadata: {}
      });
      return json({ success: true });
    }

    // ==================================
    // REPORTS (Phase 7-9)
    // ==================================
    // filters_json on a saved report_definitions row is NEVER trusted as
    // an authorization boundary -- every /report/run call below passes
    // the REQUESTING user into reportsDB.executeReportRun(), which
    // re-resolves item-access at execution time via the same helpers
    // analytics.js uses. A saved report cannot be used to read data the
    // runner no longer has access to.

    if (path === "/api/v1/reports/list") {
      const url = new URL(request.url);
      const reportType = url.searchParams.get("report_type");
      const { condition, params } = await itemAccess.getAccessibleWhereClause(env.DB, user, "report_definitions", "read");
      const typeClause = reportType ? "AND report_type = ?" : "";
      const result = await env.DB.prepare(`
        SELECT * FROM report_definitions
        WHERE status = 'active' ${condition ? "AND " + condition : ""} ${typeClause}
        ORDER BY created_at DESC
      `).bind(...params, ...(reportType ? [reportType] : [])).all();
      return json({ success: true, reports: result.results || [] });
    }

    // Column manifest for a report type -- lets the UI render a
    // checklist of available columns (and which are groupable) without
    // running the report itself. Static metadata, no DB query beyond
    // the permission check already applied via readResourceMap above.
    if (path === "/api/v1/report/column-options") {
      const url = new URL(request.url);
      const reportType = url.searchParams.get("report_type");
      if (!reportType) return failure("report_type is required");

      const columns = reportsDB.getReportColumnOptions(reportType);
      if (!columns) {
        return json({ success: true, columns: [], note: "No column customization available for this report type." });
      }
      return json({ success: true, columns });
    }

    if (path === "/api/v1/report/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const report = await itemAccess.getItemById(env.DB, "report_definitions", id);
      if (!report) return failure("Report not found", 404);
      const canAccess = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "read", report);
      if (!canAccess) return failure("Report not found", 404);

      const schedules = await env.DB.prepare(`SELECT * FROM report_schedules WHERE report_id = ?`).bind(id).all();
      return json({ success: true, report, schedules: schedules.results || [] });
    }

    if (path === "/api/v1/report/runs/list") {
      const url = new URL(request.url);
      const reportId = Number(url.searchParams.get("report_id"));
      if (!reportId) return failure("report_id is required");

      const report = await itemAccess.getItemById(env.DB, "report_definitions", reportId);
      if (!report) return failure("Report not found", 404);
      const canAccess = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "read", report);
      if (!canAccess) return failure("Report not found", 404);

      const runs = await env.DB.prepare(`
        SELECT * FROM report_runs WHERE report_id = ? ORDER BY started_at DESC LIMIT 50
      `).bind(reportId).all();
      return json({ success: true, runs: runs.results || [] });
    }

    if (path === "/api/v1/report/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name", "reportType"]);
      if (!reportsDB.isValidReportType(body.reportType)) {
        return failure(`Unknown report_type: ${body.reportType}`);
      }

      const result = await env.DB.prepare(`
        INSERT INTO report_definitions (name, report_type, filters_json, columns_json, grouping_json, sort_json, owner_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        body.name, body.reportType,
        body.filters ? JSON.stringify(body.filters) : null,
        body.columns ? JSON.stringify(body.columns) : null,
        body.grouping ? JSON.stringify(body.grouping) : null,
        body.sort ? JSON.stringify(body.sort) : null,
        user.user_id
      ).run();

      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "report_definition",
        entityId: result.meta.last_row_id, metadata: { report_type: body.reportType }
      });
      return json({ success: true, id: result.meta.last_row_id });
    }

    if (path === "/api/v1/report/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, "report_definitions", body.id);
      if (!existing) return failure("Report not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "update", existing);
      if (!canUpdate) return failure("Report not found", 404);

      await env.DB.prepare(`
        UPDATE report_definitions SET
          name = ?, status = ?, columns_json = ?, grouping_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        body.name ?? existing.name,
        body.status ?? existing.status,
        body.columns ? JSON.stringify(body.columns) : existing.columns_json,
        body.grouping !== undefined ? (body.grouping ? JSON.stringify(body.grouping) : null) : existing.grouping_json,
        body.id
      ).run();

      await logAudit(env.DB, {
        userId: user.user_id, action: "update", entityType: "report_definition", entityId: body.id, metadata: {}
      });
      return json({ success: true });
    }

    // Ad-hoc run: executes immediately for THIS user (item-access scoped
    // to them, not the report's owner), records a report_runs row, and
    // returns either JSON rows or a downloadable CSV/HTML file depending
    // on `format`. This is the one endpoint in this section that returns
    // a non-JSON Response body when format=csv|html.
    if (path === "/api/v1/report/run" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "startDate", "endDate"]);

      const report = await itemAccess.getItemById(env.DB, "report_definitions", body.id);
      if (!report) return failure("Report not found", 404);
      const canAccess = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "read", report);
      if (!canAccess) return failure("Report not found", 404);

      const format = body.format || "json";
      // Column selection / grouping: request body overrides the saved
      // report_definitions.columns_json/grouping_json when provided,
      // otherwise fall back to what was saved at creation/edit time.
      // Either way this is a DISPLAY parameter only -- see
      // applyColumnSelectionAndGrouping() in reports.js, which applies
      // it strictly after the handler's own item-access-scoped query.
      let selectedColumns = body.columns;
      if (selectedColumns === undefined && report.columns_json) {
        try { selectedColumns = JSON.parse(report.columns_json); } catch { selectedColumns = undefined; }
      }
      let groupBy = body.groupBy;
      if (groupBy === undefined && report.grouping_json) {
        try { groupBy = JSON.parse(report.grouping_json); } catch { groupBy = undefined; }
      }

      const filters = {
        startDate: body.startDate, endDate: body.endDate, currency: body.currency || null,
        outputFormat: format, selectedColumns, groupBy,
        // cohort_analysis / ltv_analysis-specific filters (brief §17/§18)
        // -- harmless no-ops for every other report type, which never
        // reads these keys off filters.
        cohortMetric: body.cohortMetric || undefined,
        groupByDimension: body.groupByDimension || undefined
      };

      const result = await reportsDB.executeReportRun(env.DB, user, report, { filters });
      await logAudit(env.DB, {
        userId: user.user_id, action: "read", entityType: "report_run",
        entityId: result.runId, metadata: { report_id: body.id, format }
      });

      if (!result.success) {
        return failure(result.error, 422);
      }

      if (format === "csv") {
        const csv = reportsDB.toCsv(result);
        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${report.name.replace(/[^a-z0-9]+/gi, '-')}-${body.startDate}-to-${body.endDate}.csv"`
          }
        });
      }
      if (format === "html") {
        const html = reportsDB.toHtml(result, report.name);
        return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      return json({ success: true, runId: result.runId, columns: result.columns, rows: result.rows });
    }

    if (path === "/api/v1/report/schedule/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["reportId", "frequency"]);

      const report = await itemAccess.getItemById(env.DB, "report_definitions", body.reportId);
      if (!report) return failure("Report not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "update", report);
      if (!canUpdate) return failure("Report not found", 404);

      // First run is scheduled starting now, per the requested frequency
      // (i.e. a daily schedule created today first fires tomorrow, not
      // immediately -- use "Run Now" / /report/run for an immediate result).
      const nextRunAt = new Date(
        body.frequency === "daily" ? Date.now() + 86400000 :
        body.frequency === "weekly" ? Date.now() + 7 * 86400000 :
        body.frequency === "monthly" ? new Date(new Date().setMonth(new Date().getMonth() + 1)) :
        Date.now() + 86400000
      ).toISOString();

      const scheduleResult = await env.DB.prepare(`
        INSERT INTO report_schedules (report_id, frequency, timezone, next_run_at, enabled, output_format, created_by)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).bind(body.reportId, body.frequency, body.timezone || "UTC", nextRunAt, body.outputFormat || "csv", user.user_id).run();
      const scheduleId = scheduleResult.meta.last_row_id;

      // Default to the creating user as the sole recipient when none are
      // given explicitly -- avoids requiring the client to know/send its
      // own user_id just to schedule "deliver to me".
      const recipients = (body.recipients && body.recipients.length > 0)
        ? body.recipients
        : [{ userId: user.user_id }];
      for (const recipient of recipients) {
        await env.DB.prepare(`
          INSERT INTO report_recipients (schedule_id, user_id, email) VALUES (?, ?, ?)
        `).bind(scheduleId, recipient.userId ?? null, recipient.email ?? null).run();
      }

      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "report_schedule",
        entityId: scheduleId, metadata: { report_id: body.reportId, frequency: body.frequency }
      });
      return json({ success: true, id: scheduleId });
    }

    if (path === "/api/v1/report/schedule/toggle" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "enabled"]);

      const schedule = await env.DB.prepare(`SELECT rs.*, rd.owner_id, rd.id AS report_id_check FROM report_schedules rs JOIN report_definitions rd ON rd.id = rs.report_id WHERE rs.id = ?`).bind(body.id).first();
      if (!schedule) return failure("Schedule not found", 404);
      const report = await itemAccess.getItemById(env.DB, "report_definitions", schedule.report_id);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, "report_definitions", "update", report);
      if (!canUpdate) return failure("Schedule not found", 404);

      await env.DB.prepare(`UPDATE report_schedules SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(body.enabled ? 1 : 0, body.id).run();
      await logAudit(env.DB, {
        userId: user.user_id, action: "update", entityType: "report_schedule", entityId: body.id, metadata: { enabled: body.enabled }
      });
      return json({ success: true });
    }

    // ==================================
    // ALERTS (Phase 13)
    // ==================================
    // getScopedAlerts()/acknowledgeAlert() in alertsDB do their own
    // item-access-equivalent scoping internally (alerts reference a
    // rule's scope_type/scope_id, not a directly registered item-access
    // resource) -- this section trusts that scoping rather than
    // re-deriving it, same as analyticsDB's queries are trusted above.

    if (path === "/api/v1/analytics/alerts/list") {
      const url = new URL(request.url);
      const status = url.searchParams.get("status") || "open";
      const alerts = await alertsDB.getScopedAlerts(env.DB, user, status);
      return json({ success: true, alerts });
    }

    if (path === "/api/v1/analytics/alert/acknowledge" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const result = await alertsDB.acknowledgeAlert(env.DB, user, body.id);
      if (!result.success) return failure(result.error, 404);

      await logAudit(env.DB, {
        userId: user.user_id, action: "update", entityType: "analytics_alert", entityId: body.id, metadata: {}
      });
      return json({ success: true });
    }

    // Alert rule CRUD -- create/delete are admin-only by the permission
    // seed in 0031 (editor: create=0, delete=0); editors can read/update
    // (acknowledge) but not define new rules or remove them.
    if (path === "/api/v1/analytics/alert-rules/list") {
      const result = await env.DB.prepare(`SELECT * FROM analytics_alert_rules ORDER BY created_at DESC`).all();
      return json({ success: true, rules: result.results || [] });
    }

    if (path === "/api/v1/analytics/alert-rule/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name", "metric", "thresholdType"]);

      const result = await env.DB.prepare(`
        INSERT INTO analytics_alert_rules (name, metric, scope_type, scope_id, threshold_type, threshold_value, comparison_window_days, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        body.name, body.metric, body.scopeType || "global", body.scopeId ?? null,
        body.thresholdType, body.thresholdValue ?? null, body.comparisonWindowDays || 7, user.user_id
      ).run();

      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "analytics_alert_rule",
        entityId: result.meta.last_row_id, metadata: { metric: body.metric }
      });
      return json({ success: true, id: result.meta.last_row_id });
    }

    if (path === "/api/v1/analytics/alert-rule/toggle" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "enabled"]);
      await env.DB.prepare(`UPDATE analytics_alert_rules SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(body.enabled ? 1 : 0, body.id).run();
      await logAudit(env.DB, {
        userId: user.user_id, action: "update", entityType: "analytics_alert_rule", entityId: body.id, metadata: { enabled: body.enabled }
      });
      return json({ success: true });
    }

        // ==================================
    // BANNERS CRUD
    // ==================================

    if (path === "/api/v1/banners/list") {
      const result = await bannerDB.getAllBanners(env.DB);
      return json({ banners: result });
    }

    if (path === "/api/v1/banner/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["title"]);
      const id = await bannerDB.createBanner(env.DB, body);
      return json({ success: true, id });
    }

    if (path === "/api/v1/banner/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await bannerDB.updateBanner(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/banner/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await bannerDB.deleteBanner(env.DB, body.id);
      return success();
    }

 

    return json({
      success: false,
      error: "Endpoint not found"
    }, 404);

  } catch (error) {

    return json({
      success: false,
      error: error.message
    }, 500);

  }
}

// =====================================================
// HELPERS
// =====================================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

function success(data = {}) {

    return json({
        success: true,
        ...data
    });

}

function failure(message, status = 400) {

    return json({
        success: false,
        error: message
    }, status);

}

/**
 * Validate a client-supplied GEO rule list for content_geo. Returns
 * { rules } (normalized: uppercase country_code, status in
 * allowed|blocked only) or { error }. `undefined`/non-array input means
 * "client didn't send geo rules" -> { rules: null } so the caller leaves
 * existing rules untouched (an explicit [] DOES clear them). Only
 * country_code + status are accepted: content_geo also has
 * redirect_url/bonus_override columns, but nothing renders them for
 * generic content yet, and redirect_url is a URL field that would need
 * the same javascript:/data: protection as every other URL -- so they
 * are deliberately not accepted here rather than stored unvalidated.
 * Every country_code must exist in `countries` (the table content_geo
 * references), so a typo gets a clear 400 instead of a silent orphan.
 */
async function normalizeGeoRules(db, rawRules) {
  if (!Array.isArray(rawRules)) return { rules: null };
  const seen = new Set();
  const rules = [];
  for (const r of rawRules) {
    const code = String(r?.country_code || "").trim().toUpperCase();
    const status = String(r?.status || "").trim();
    if (!/^[A-Z]{2}$/.test(code)) return { error: `Invalid country code: "${r?.country_code}"` };
    if (status !== "allowed" && status !== "blocked") return { error: `GEO status must be "allowed" or "blocked" (got "${r?.status}")` };
    if (seen.has(code)) return { error: `Duplicate GEO rule for country ${code}` };
    seen.add(code);
    rules.push({ country_code: code, status });
  }
  if (rules.length) {
    const placeholders = rules.map(() => "?").join(",");
    const found = (await db.prepare(`SELECT code FROM countries WHERE code IN (${placeholders})`).bind(...rules.map(r => r.country_code)).all()).results || [];
    const foundCodes = new Set(found.map(c => c.code));
    const unknown = rules.filter(r => !foundCodes.has(r.country_code)).map(r => r.country_code);
    if (unknown.length) return { error: `Unknown country code(s): ${unknown.join(", ")}` };
  }
  return { rules };
}


/**
 * Validates logo_media_id/featured_image_media_id (plain integers or
 * null -- FK to media_library, no existence check here since an
 * invalid id just LEFT JOINs to nothing, same non-fatal posture as any
 * other optional FK in this codebase) and tracking_url (sanitizeUrl(),
 * the same javascript:/data:-scheme protection every other URL field
 * in this codebase gets). Returns { fields } or { error }.
 * `undefined` for a key means "client didn't send it" -> omitted from
 * `fields` so the caller leaves the existing value untouched on update.
 */
function normalizeMediaAndTrackingFields(body) {
  const fields = {};
  for (const [bodyKey, fieldKey] of [["logo_media_id", "logoMediaId"], ["featured_image_media_id", "featuredImageMediaId"]]) {
    if (body[bodyKey] === undefined) continue;
    if (body[bodyKey] === null || body[bodyKey] === "") { fields[fieldKey] = null; continue; }
    const id = parseInt(body[bodyKey]);
    if (!Number.isInteger(id)) return { error: `${bodyKey} must be a media library id or null` };
    fields[fieldKey] = id;
  }
  if (body.tracking_url !== undefined) {
    if (!body.tracking_url) {
      fields.trackingUrl = null;
    } else {
      const safe = sanitizeUrl(body.tracking_url, false);
      if (!safe) return { error: "tracking_url is not a valid/safe URL" };
      fields.trackingUrl = safe;
    }
  }
  return { fields };
}

function validate(body, required) {

    for (const field of required) {

        if (
            body[field] === undefined ||
            body[field] === null ||
            body[field] === ""
        ) {
            throw new Error(`${field} is required`);
        }

    }

}


// =====================================================
// CASINOS
// =====================================================

async function createCasino(request, env, user) {

  const body = await request.json();
  validate(body, [
    "slug",
    "name",
    "affiliate_url"
  ]);
  // SECURITY: set ownership server-side, never trust body.created_by
  body.created_by = user.user_id;
  const casinoId = await casinos.createCasino(env.DB, body);
  if (Array.isArray(body.category_ids)) {
    await casinos.setCasinoCategories(
      env.DB,
      casinoId,
      body.category_ids
    );
  }
  await invalidateCasinos(env);

  // Best-effort subscriber notification -- off by default (see
  // worker/content-notifications.js), never blocks/fails this save.
  if (body.published !== 0) {
    await notifyOnPublish(env, request, { type: 'casino', title: body.name, slug: body.slug });
  }

  return success();
}

async function updateCasino(request, env, user) {

  const body = await request.json();

  validate(body, [
    "old_slug",
    "slug",
    "name",
    "affiliate_url"
  ]);

  // Item-level access check
  const existing = await itemAccess.getItemBySlug(env.DB, 'casinos', body.old_slug);
  if (!existing) return failure("Casino not found", 404);
  const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'casinos', 'update', existing);
  if (!canUpdate) return failure("Casino not found", 404);

  await casinos.updateCasino(
    env.DB,
    body.old_slug,
    body
  );

  const casinoId = await casinos.getCasinoIdBySlug(
    env.DB,
    body.slug
  );

  if (casinoId && Array.isArray(body.category_ids)) {
    await casinos.setCasinoCategories(
      env.DB,
      casinoId,
      body.category_ids
    );
  }
  await invalidateCasinos(env);
  return success();
}

async function deleteCasino(request, env, user) {
  const body = await request.json();
  validate(body, ["slug"]);

  // Item-level access check
  const existing = await itemAccess.getItemBySlug(env.DB, 'casinos', body.slug);
  if (!existing) return failure("Casino not found", 404);
  const canDelete = await itemAccess.canAccessItem(env.DB, user, 'casinos', 'delete', existing);
  if (!canDelete) return failure("Casino not found", 404);

  // System 2 (offers) deliberately does not cascade-delete when a
  // casino is removed, to avoid silently destroying offer history --
  // see migrations/0024_offers.sql. Surface that as a clear error
  // instead of letting it fall through to a raw FK constraint failure.
  const offerDependents = await offersDB.getCasinoOfferDependents(env.DB, existing.id);
  if (offerDependents) {
    return failure(
      `Cannot delete: this casino has ${offerDependents.offers} offer(s) (including historical/expired ones) attached. ` +
      `Unpublish the casino instead, or remove its offers first.`,
      409
    );
  }
  const trackingDependents = await trackingLinksDB.getCasinoTrackingLinkDependents(env.DB, existing.id);
  if (trackingDependents) {
    return failure(
      `Cannot delete: this casino has ${trackingDependents.tracking_links} tracking link(s) attached. ` +
      `Unpublish the casino instead, or remove its tracking links first.`,
      409
    );
  }

  const termDependents = await casinos.getCasinoTermDependents(env.DB, existing.id);
  if (termDependents) {
    return failure(
      `Cannot delete: this casino has ${termDependents.terms} commercial term(s) attached. ` +
      `Unpublish the casino instead, or remove its commercial terms first.`,
      409
    );
  }

  await casinos.deleteCasino(
    env.DB,
    body.slug
  );

  await invalidateCasinos(env);
  return success();
}


// =====================================================
// REVIEWS
// =====================================================

async function createReview(request, env, user) {
  const body = await request.json();
  validate(body, ["slug", "title", "content", "casino_slug"]);
  body.created_by = user.user_id;
  await reviews.createReview(
    env.DB,
    body
  );

  if (body.published !== 0) {
    await notifyOnPublish(env, request, { type: 'review', title: body.title, slug: body.slug });
  }

  return success();
}

async function updateReview(request, env, user) {
  const body = await request.json();
  validate(body, ["slug", "title", "content"]);

  // Item-level access check
  const existing = await itemAccess.getItemBySlug(env.DB, 'reviews', body.slug);
  if (!existing) return failure("Review not found", 404);
  const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'reviews', 'update', existing);
  if (!canUpdate) return failure("Review not found", 404);

  await reviews.updateReview(
    env.DB,
    body.slug,
    body
  );

  return success();
}



// =====================================================
// PAGES
// =====================================================

async function createPage(request, env, user) {
  const body = await request.json();
  validate(body, ["slug", "type", "template", "title"]);
  body.created_by = user.user_id;
  await pages.createPage(
    env.DB,
    body
  );

  return success();
}

async function updatePage(request, env, user) {
  const body = await request.json();
  validate(body, ["slug", "title"]);

  // Item-level access check
  const existing = await itemAccess.getItemBySlug(env.DB, 'pages', body.slug);
  if (!existing) return failure("Page not found", 404);
  const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'pages', 'update', existing);
  if (!canUpdate) return failure("Page not found", 404);

  await pages.updatePage(
    env.DB,
    body.slug,
    body
  );

  return success();
}


// =====================================================
// GEO RULES
// =====================================================

async function saveGeoRule(request, env) {
  const body = await request.json();
  validate(body, ["casino_slug", "country_code", "status"]);
  await geo.saveGeoRule(
    env.DB,
    body
  );

  return success();
}


// =====================================================
// SETTINGS
// =====================================================

async function saveSettings(request, env, user) {

  // Site settings — including the GPWA verification script/seal,
  // which is trusted raw markup (not sanitized) — are only ever
  // writable by admin or editor accounts. This mirrors the
  // page-level gate already enforced on /en/dashboard/settings
  // (see renderAdminPage's allowedRoles), which this endpoint
  // was missing.
  if (!user || !requireRole(user, "editor")) {
    return failure(
      "You do not have permission to modify site settings",
      403
    );
  }

  const body = await request.json();

  if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
    return failure("Settings object cannot be empty");
  }

  await settings.saveSettings(
    env.DB,
    sanitizeHeaderHeroInput(body)
  );
  const hostname =
  new URL(request.url)
    .hostname
    .toLowerCase();

await deleteCached(
  env,
  CACHE_KEYS.SITE_SETTINGS(hostname)
);

  return success();
}


// =====================================================
// AI REVIEW GENERATION
// =====================================================

async function generateReview(request, env) {
  const body = await request.json();
  validate(body, ["casino", "country", "slug"]);

  const content = await aiEngine.generateFullReview(
    env,
    request,
    body.casino,
    body.country,
    body.slug
  );

  await ai.logAIGeneration(
    env.DB,
    "review",
    body.slug,
    `Full review generation for ${body.casino} (${body.country})`,
    "@cf/zai-org/glm-4.7-flash"
  );

  return json({
    success: true,
    content
  });
}


// ==================================
// NEWS
// ==================================

async function createNews(request, env, user) {
  const body = await request.json();

  validate(body, [
    "slug",
    "title",
    "content"
  ]);
  body.created_by = user.user_id;
  await news.createNews(env.DB, body);
  await searchReindexHook(env, body.slug);   // keep the news search index current (never throws)
  await invalidateNews(env);

  if (body.published !== 0) {
    await notifyOnPublish(env, request, { type: 'news', title: body.title, slug: body.slug });
  }

  return success();
}

async function updateNews(request, env, user) {
  const body = await request.json();

  validate(body, [
    "old_slug",
    "slug",
    "title",
    "content"
  ]);

  // Item-level access check
  const existing = await itemAccess.getItemBySlug(env.DB, 'news', body.old_slug);
  if (!existing) return failure("News article not found", 404);
  const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'news', 'update', existing);
  if (!canUpdate) return failure("News article not found", 404);

  // Newsroom hooks: no-ops unless the news_editorial_workflow flag is on.
  const newsroomCtx = await beforeNewsUpdate(env, user, body);
  if (newsroomCtx.denied) return failure(newsroomCtx.denied.error, newsroomCtx.denied.status);

  await news.updateNews(
    env.DB,
    body.old_slug,
    body
  );

  await slugRedirectHook(env, body);   // old URL 301s to the new one if the slug changed (never throws)
  await searchReindexHook(env, body.slug);
  await afterNewsUpdate(env, user, body, newsroomCtx);

  await invalidateNews(env);
  return success();
}

async function deleteNews(request, env, user) {
  const body = await request.json();

  validate(body, ["slug"]);

  // Item-level access check
  const existing = await itemAccess.getItemBySlug(env.DB, 'news', body.slug);
  if (!existing) return failure("News article not found", 404);
  const canDelete = await itemAccess.canAccessItem(env.DB, user, 'news', 'delete', existing);
  if (!canDelete) return failure("News article not found", 404);

  await news.deleteNews(
    env.DB,
    body.slug
  );

  await invalidateNews(env);
  return success();
}





/* =========================================================
PLATFORM UPDATES FUNCTIONS
========================================================= */
async function listPlatformUpdates(request, env, user) {
  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'platform-updates', 'read', 'pu'
  );
  const whereClause = condition ? `WHERE ${condition}` : '';

  const result = await env.DB.prepare(
    `SELECT pu.*, a.name AS author_name, a.slug AS author_slug,
            a.avatar_url AS author_avatar, a.role AS author_role,
            m.url AS featured_image_url, m.thumbnail_url AS featured_image_thumbnail,
            m.alt_text AS featured_image_alt
     FROM platform_updates pu
     LEFT JOIN authors a ON pu.author_id = a.id
     LEFT JOIN media_library m ON m.id = pu.featured_image
     ${whereClause}
     ORDER BY COALESCE(pu.published_at, pu.created_at) DESC`
  ).bind(...params).all();

  return json({ success: true, updates: result.results || [] });
}



async function createPlatformUpdate(request, env, user) {
const body = await request.json();

validate(body, [
"slug",
"title",
"content"
]);

body.created_by = user.user_id;

const existing = await env.DB.prepare("SELECT id FROM platform_updates WHERE slug = ? LIMIT 1")
.bind(body.slug)
.first();

if (existing) {
return json(
{
success: false,
error: "A platform update with this slug already exists."
},
409
);
}

await platformUpdates.createPlatformUpdate(env.DB, {
slug: body.slug,
title: body.title,
excerpt: body.excerpt || null,
content: body.content,
featured_image: body.featured_image || null,
seo_title: body.seo_title || null,
seo_description: body.seo_description || null,
seo_keywords: body.seo_keywords || null,
author_id: body.author_id || null,
published: body.published ?? 1,
featured: body.featured ?? 0,
published_at: body.published_at || null,
created_by: user.user_id
});

return success();
}

async function updatePlatformUpdate(request, env, user) {
const body = await request.json();

validate(body, [
"id",
"slug",
"title",
"content"
]);

const existing = await itemAccess.getItemById(env.DB, 'platform-updates', body.id);
if (!existing) {
return json(
{
success: false,
error: "Platform update not found."
},
404
);
}

// Item-level access check
const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'platform-updates', 'update', existing);
if (!canUpdate) return json({ success: false, error: "Platform update not found." }, 404);

const duplicate = await env.DB.prepare("SELECT id FROM platform_updates WHERE slug = ? AND id != ? LIMIT 1")
.bind(body.slug, body.id)
.first();

if (duplicate) {
return json(
{
success: false,
error: "Another platform update already uses this slug."
},
409
);
}

await platformUpdates.updatePlatformUpdate(
env.DB,
body.id,
{
slug: body.slug,
title: body.title,
excerpt: body.excerpt || null,
content: body.content,
featured_image: body.featured_image || null,
seo_title: body.seo_title || null,
seo_description: body.seo_description || null,
seo_keywords: body.seo_keywords || null,
author_id: body.author_id || null,
published: body.published ?? 1,
featured: body.featured ?? 0,
published_at: body.published_at || null
}
);

return success();
}

async function deletePlatformUpdate(request, env, user) {
const body = await request.json();

validate(body, ["id"]);

const existing = await itemAccess.getItemById(env.DB, 'platform-updates', body.id);
if (!existing) {
return json(
{
success: false,
error: "Platform update not found."
},
404
);
}

// Item-level access check
const canDelete = await itemAccess.canAccessItem(env.DB, user, 'platform-updates', 'delete', existing);
if (!canDelete) return json({ success: false, error: "Platform update not found." }, 404);

await platformUpdates.deletePlatformUpdate(
env.DB,
body.id
);

return success();
}

/* =========================================================
SEO LANDING PAGES FUNCTIONS (country_custom / category_country)
========================================================= */

async function listSeoPagesEndpoint(request, env, user) {
  const urlObj = new URL(request.url);
  const pageType = urlObj.searchParams.get("page_type") || null;

  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'seo_pages', 'read', 'sp'
  );
  const whereParts = [];
  const bindParams = [];
  if (condition) { whereParts.push(condition); bindParams.push(...params); }
  if (pageType) { whereParts.push("sp.page_type = ?"); bindParams.push(pageType); }
  const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  const result = await env.DB.prepare(
    `SELECT sp.*, a.name AS author_name
     FROM seo_pages sp
     LEFT JOIN authors a ON sp.author_id = a.id
     ${whereClause}
     ORDER BY sp.updated_at DESC`
  ).bind(...bindParams).all();

  return json({ success: true, pages: result.results || [] });
}

async function getSeoPageEndpoint(request, env, user) {
  const urlObj = new URL(request.url);
  const id = urlObj.searchParams.get("id");
  if (!id) return failure("id is required", 422);

  const page = await itemAccess.getItemById(env.DB, 'seo_pages', id);
  if (!page) return failure("SEO page not found.", 404);

  const canRead = await itemAccess.canAccessItem(env.DB, user, 'seo_pages', 'read', page);
  if (!canRead) return failure("SEO page not found.", 404);

  page.casino_selections = await seoPages.getSeoPageCasinos(env.DB, page.id);
  return json({ success: true, page });
}

async function createSeoPageEndpoint(request, env, user) {
  const body = await request.json();
  validate(body, ["page_type", "slug", "country_code", "title"]);
  body.created_by = user.user_id;
  body.updated_by = user.user_id;

  try {
    const id = await seoPages.createSeoPage(env.DB, body);
    if (Array.isArray(body.casino_selections)) {
      await seoPages.setSeoPageCasinos(env.DB, id, body.casino_selections);
    }
    await invalidateNav(env);
    return success({ id });
  } catch (error) {
    return failure(error.message || "Could not create SEO page.", 422);
  }
}

async function updateSeoPageEndpoint(request, env, user) {
  const body = await request.json();
  validate(body, ["id", "title"]);

  const existing = await itemAccess.getItemById(env.DB, 'seo_pages', body.id);
  if (!existing) return failure("SEO page not found.", 404);

  const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'seo_pages', 'update', existing);
  if (!canUpdate) return failure("SEO page not found.", 404);

  try {
    body.updated_by = user.user_id;
    await seoPages.updateSeoPage(env.DB, body.id, body);
    if (Array.isArray(body.casino_selections)) {
      await seoPages.setSeoPageCasinos(env.DB, body.id, body.casino_selections);
    }
    await invalidateNav(env);
    return success();
  } catch (error) {
    return failure(error.message || "Could not update SEO page.", 422);
  }
}

async function deleteSeoPageEndpoint(request, env, user) {
  const body = await request.json();
  validate(body, ["id"]);

  const existing = await itemAccess.getItemById(env.DB, 'seo_pages', body.id);
  if (!existing) return failure("SEO page not found.", 404);

  const canDelete = await itemAccess.canAccessItem(env.DB, user, 'seo_pages', 'delete', existing);
  if (!canDelete) return failure("SEO page not found.", 404);

  await seoPages.deleteSeoPage(env.DB, body.id);
  await invalidateNav(env);
  return success();
}

async function searchCountriesEndpoint(request, env, user) {
  const urlObj = new URL(request.url);
  const q = urlObj.searchParams.get("q") || "";
  if (!q.trim()) return json({ success: true, countries: [] });
  const rows = await seoPages.searchCountries(env.DB, q);
  return json({ success: true, countries: rows });
}

async function eligibleCasinosEndpoint(request, env, user) {
  const urlObj = new URL(request.url);
  const countryCode = urlObj.searchParams.get("country_code");
  const categorySlug = urlObj.searchParams.get("category_slug");
  if (!countryCode) return failure("country_code is required", 422);

  const rows = categorySlug
    ? await seoPages.getEligibleCasinosForCategoryCountry(env.DB, categorySlug, countryCode)
    : await casinos.getCasinosByCountryAllowlist(env.DB, countryCode);
  return json({ success: true, casinos: rows });
}

async function discoverCategoryCountryEndpoint(request, env, user) {
  const urlObj = new URL(request.url);
  const min = Number(urlObj.searchParams.get("min")) || 1;

  const [combos, existingPages] = await Promise.all([
    seoPages.discoverEligibleCategoryCountryCombos(env.DB, min),
    seoPages.getAllSeoPages(env.DB, { pageType: "category_country" })
  ]);

  const pageByKey = {};
  for (const p of existingPages) pageByKey[`${p.category_id}::${p.country_code}`] = p;

  const combosWithStatus = combos.map((c) => {
    const existing = pageByKey[`${c.category_id}::${c.country_code}`];
    return {
      ...c,
      seo_page_id: existing?.id || null,
      status: existing ? existing.status : "eligible",
      published: existing ? !!existing.published : false
    };
  });

  return json({ success: true, combos: combosWithStatus });
}

async function generateCategoryCountryDraftEndpoint(request, env, user) {
  const body = await request.json();
  validate(body, ["category_id", "category_slug", "category_name", "country_code", "country_name"]);

  try {
    const id = await seoPages.createSeoPage(env.DB, {
      page_type: "category_country",
      slug: body.category_slug,
      country_code: body.country_code,
      category_id: Number(body.category_id),
      title: `${body.category_name} Casinos in ${body.country_name}`,
      casino_mode: "auto_priority",
      status: "draft",
      published: false,
      sitemap_enabled: true,
      auto_generated: true,
      content_json: {},
      created_by: user.user_id,
      updated_by: user.user_id
    });
    return success({ id });
  } catch (error) {
    return failure(error.message || "Could not generate draft.", 422);
  }
}


function requireAdmin(user) {
  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}

