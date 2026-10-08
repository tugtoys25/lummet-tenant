// =====================================================
// SUPER API — ROUTER
// Explicit allowlist for /en/api/super/*. Every route is
// enumerated; there is no wildcard passthrough and no
// arbitrary-SQL endpoint (rule #25).
// =====================================================

import { verifySuperApiRequest, logSuperApiRequest } from "./auth.js";
import * as h from "./handlers.js";
import * as ah from "./handlers-affiliate.js";
import * as anh from "./handlers-analytics.js";
import * as rh from "./handlers-reporting.js";
import * as aih from "./handlers-ai.js";
import * as nh from "./handlers-newsroom.js";
import * as rsh from "./handlers-research.js";

// Each entry: [METHOD, path-pattern, handler, resource-name]
// Path patterns use ":param" for a single dynamic segment.
const ROUTES = [
  ["GET", "/en/api/super/handshake", h.handleHandshake, null],
  ["GET", "/en/api/super/health", h.handleHealth, null],
  ["GET", "/en/api/super/capabilities", h.handleCapabilities, null],

  ["GET", "/en/api/super/casinos", h.handleListCasinos, "casinos"],
  ["GET", "/en/api/super/casinos/:id", h.handleGetCasino, "casinos"],
  ["POST", "/en/api/super/casinos", h.handleCreateCasino, "casinos"],
  ["PUT", "/en/api/super/casinos/:id", h.handleUpdateCasino, "casinos"],
  ["DELETE", "/en/api/super/casinos/:id", h.handleDeleteCasino, "casinos"],

  ["GET", "/en/api/super/reviews", h.handleListReviews, "reviews"],
  ["GET", "/en/api/super/reviews/:id", h.handleGetReview, "reviews"],
  ["POST", "/en/api/super/reviews", h.handleCreateReview, "reviews"],
  ["PUT", "/en/api/super/reviews/:id", h.handleUpdateReview, "reviews"],
  ["DELETE", "/en/api/super/reviews/:id", h.handleDeleteReview, "reviews"],

  ["GET", "/en/api/super/news", h.handleListNews, "news"],
  ["GET", "/en/api/super/news/:id", h.handleGetNews, "news"],
  ["POST", "/en/api/super/news", h.handleCreateNews, "news"],
  ["PUT", "/en/api/super/news/:id", h.handleUpdateNews, "news"],
  ["DELETE", "/en/api/super/news/:id", h.handleDeleteNews, "news"],

  ["GET", "/en/api/super/pages", h.handleListPages, "pages"],
  ["GET", "/en/api/super/pages/:id", h.handleGetPage, "pages"],
  ["POST", "/en/api/super/pages", h.handleCreatePage, "pages"],
  ["PUT", "/en/api/super/pages/:id", h.handleUpdatePage, "pages"],
  ["DELETE", "/en/api/super/pages/:id", h.handleDeletePage, "pages"],

  ["GET", "/en/api/super/categories", h.handleListCategories, "categories"],
  ["GET", "/en/api/super/categories/:id", h.handleGetCategory, "categories"],
  ["POST", "/en/api/super/categories", h.handleCreateCategory, "categories"],
  ["PUT", "/en/api/super/categories/:id", h.handleUpdateCategory, "categories"],
  ["DELETE", "/en/api/super/categories/:id", h.handleDeleteCategory, "categories"],

  // Research Zone (research_items) -- see handlers.js section header
  // for why this is id-keyed and not registered in item-access.js.
  ["GET", "/en/api/super/research", h.handleListResearch, "research"],
  ["GET", "/en/api/super/research/:id", h.handleGetResearch, "research"],
  ["POST", "/en/api/super/research", h.handleCreateResearch, "research"],
  ["PUT", "/en/api/super/research/:id", h.handleUpdateResearch, "research"],
  ["DELETE", "/en/api/super/research/:id", h.handleDeleteResearch, "research"],

  ["GET", "/en/api/super/payment-methods", h.handleListPaymentMethods, "payment_methods"],
  ["GET", "/en/api/super/payment-methods/:id", h.handleGetPaymentMethod, "payment_methods"],
  ["POST", "/en/api/super/payment-methods", h.handleCreatePaymentMethod, "payment_methods"],
  ["PUT", "/en/api/super/payment-methods/:id", h.handleUpdatePaymentMethod, "payment_methods"],
  ["DELETE", "/en/api/super/payment-methods/:id", h.handleDeletePaymentMethod, "payment_methods"],

  // User Inquiries / Casino Submissions / Notifications -- see
  // handlers.js section header: no tenant-side RBAC exists for these
  // yet, this Super API layer is the first place they're gated at all.
  ["GET", "/en/api/super/inquiries", h.handleListInquiries, "inquiries"],
  ["POST", "/en/api/super/inquiries/:id/reply", h.handleReplyInquiry, "inquiries"],
  ["GET", "/en/api/super/submissions", h.handleListSubmissions, "submissions"],
  ["PUT", "/en/api/super/submissions/:id", h.handleUpdateSubmissionStatus, "submissions"],
  ["POST", "/en/api/super/notifications", h.handleSendNotification, "notifications"],

  // Newsletter Subscribers -- list/add only, see handlers.js section
  // header for why sending an actual campaign is deliberately not here.
  ["GET", "/en/api/super/newsletter-subscribers", h.handleListSubscribers, "newsletter"],
  ["POST", "/en/api/super/newsletter-subscribers", h.handleAddSubscriber, "newsletter"],
  ["DELETE", "/en/api/super/newsletter-subscribers/:id", h.handleUnsubscribeSubscriber, "newsletter"],

  ["GET", "/en/api/super/seo", h.handleListSeoMeta, "seo"],
  ["GET", "/en/api/super/seo/lookup", h.handleGetSeoMeta, "seo"],
  ["POST", "/en/api/super/seo", h.handleSaveSeoMeta, "seo"],
  ["DELETE", "/en/api/super/seo", h.handleDeleteSeoMeta, "seo"],

  ["GET", "/en/api/super/countries", h.handleListCountries, "countries"],
  ["GET", "/en/api/super/countries/:id", h.handleGetCountry, "countries"],
  ["POST", "/en/api/super/countries", h.handleCreateCountry, "countries"],
  ["PUT", "/en/api/super/countries/:id", h.handleUpdateCountry, "countries"],
  ["DELETE", "/en/api/super/countries/:id", h.handleDeleteCountry, "countries"],

  ["GET", "/en/api/super/authors", h.handleListAuthors, "authors"],
  ["GET", "/en/api/super/authors/:id", h.handleGetAuthor, "authors"],
  ["POST", "/en/api/super/authors", h.handleCreateAuthor, "authors"],
  ["PUT", "/en/api/super/authors/:id", h.handleUpdateAuthor, "authors"],
  ["DELETE", "/en/api/super/authors/:id", h.handleDeleteAuthor, "authors"],

  ["GET", "/en/api/super/media", h.handleListMedia, "media"],
  ["GET", "/en/api/super/media/folders", h.handleListMediaFolders, "media"],
  ["GET", "/en/api/super/media/:id", h.handleGetMedia, "media"],
  ["POST", "/en/api/super/media/upload", h.handleUploadMedia, "media"],
  ["POST", "/en/api/super/media/from-url", h.handleCreateMediaFromUrl, "media"],
  ["PUT", "/en/api/super/media/:id", h.handleUpdateMedia, "media"],
  ["DELETE", "/en/api/super/media/:id", h.handleDeleteMedia, "media"],

  ["GET", "/en/api/super/settings", h.handleListSettings, "settings"],
  ["PUT", "/en/api/super/settings", h.handleUpdateSettings, "settings"],

  ["GET", "/en/api/super/users", h.handleListUsers, "users"],
  ["GET", "/en/api/super/users/:id", h.handleGetUser, "users"],
  ["PUT", "/en/api/super/users/:id/role", h.handleUpdateUserRole, "users"],
  ["DELETE", "/en/api/super/users/:id", h.handleDeleteUser, "users"],

  ["GET", "/en/api/super/components", h.handleListComponents, "components"],
  ["GET", "/en/api/super/components/:id", h.handleGetComponent, "components"],
  ["POST", "/en/api/super/components", h.handleCreateComponent, "components"],
  ["PUT", "/en/api/super/components/:id", h.handleUpdateComponent, "components"],
  ["DELETE", "/en/api/super/components/:id", h.handleDeleteComponent, "components"],

  ["GET", "/en/api/super/blocks", h.handleListBlocks, "page_components"],
  ["GET", "/en/api/super/blocks/:id", h.handleGetBlock, "page_components"],
  ["POST", "/en/api/super/blocks", h.handleCreateBlock, "page_components"],
  ["PUT", "/en/api/super/blocks/:id", h.handleUpdateBlock, "page_components"],
  ["DELETE", "/en/api/super/blocks/:id", h.handleDeleteBlock, "page_components"],

  // Permissions is a role/resource/action matrix, not an id-keyed
  // list of records — GET returns the whole matrix, PUT sets one
  // cell (body: {role, resource, action, allowed}), DELETE removes
  // one row by its numeric id.
  ["GET", "/en/api/super/permissions", h.handleListPermissions, "permissions"],
  ["PUT", "/en/api/super/permissions", h.handleSetPermission, "permissions"],
  ["DELETE", "/en/api/super/permissions/:id", h.handleDeletePermission, "permissions"],

  // Item-level access — per-user scope (none/own/all/assigned) on
  // top of the role permissions above. "defaults" is a literal
  // segment checked before the dynamic :id routes below, so a
  // numeric user id never collides with it.
  ["GET", "/en/api/super/item-access/defaults", h.handleGetItemAccessDefaults, "item_access"],
  ["PUT", "/en/api/super/item-access/defaults", h.handleSetItemAccessDefaultScope, "item_access"],
  ["GET", "/en/api/super/item-access/:id", h.handleGetUserItemAccess, "item_access"],
  ["PUT", "/en/api/super/item-access/:id", h.handleSetUserItemAccess, "item_access"],
  ["PUT", "/en/api/super/item-access/:id/assignment", h.handleSetItemAssignment, "item_access"],

  ["GET", "/en/api/super/review-blocks", h.handleListReviewBlocks, "review_blocks"],
  ["POST", "/en/api/super/review-blocks", h.handleCreateReviewBlock, "review_blocks"],
  ["PUT", "/en/api/super/review-blocks/:id", h.handleUpdateReviewBlock, "review_blocks"],
  ["DELETE", "/en/api/super/review-blocks/:id", h.handleDeleteReviewBlock, "review_blocks"],

  ["GET", "/en/api/super/ad-rules", h.handleListAdRules, "ad_rules"],
  ["POST", "/en/api/super/ad-rules", h.handleCreateAdRule, "ad_rules"],
  ["PUT", "/en/api/super/ad-rules/:id", h.handleUpdateAdRule, "ad_rules"],
  ["DELETE", "/en/api/super/ad-rules/:id", h.handleDeleteAdRule, "ad_rules"],

  ["GET", "/en/api/super/nav-items", h.handleListNavItems, "nav_items"],
  ["GET", "/en/api/super/nav-items/:id", h.handleGetNavItem, "nav_items"],
  ["POST", "/en/api/super/nav-items", h.handleCreateNavItem, "nav_items"],
  ["PUT", "/en/api/super/nav-items/:id", h.handleUpdateNavItem, "nav_items"],
  ["DELETE", "/en/api/super/nav-items/:id", h.handleDeleteNavItem, "nav_items"],

  ["GET", "/en/api/super/banners", h.handleListBanners, "banners"],
  ["GET", "/en/api/super/banners/:id", h.handleGetBanner, "banners"],
  ["POST", "/en/api/super/banners", h.handleCreateBanner, "banners"],
  ["PUT", "/en/api/super/banners/:id", h.handleUpdateBanner, "banners"],
  ["DELETE", "/en/api/super/banners/:id", h.handleDeleteBanner, "banners"],

  ["GET", "/en/api/super/updates", h.handleListPlatformUpdates, "updates"],
  ["GET", "/en/api/super/updates/:id", h.handleGetPlatformUpdate, "updates"],
  ["POST", "/en/api/super/updates", h.handleCreatePlatformUpdate, "updates"],
  ["PUT", "/en/api/super/updates/:id", h.handleUpdatePlatformUpdate, "updates"],
  ["DELETE", "/en/api/super/updates/:id", h.handleDeletePlatformUpdate, "updates"],

  // SEO landing pages (country_custom / category_country). Literal
  // segments ("discover", "countries-search", "eligible-casinos")
  // are listed before the dynamic :id route so a numeric id never
  // collides with them.
  ["GET", "/en/api/super/seo-pages-discover", h.handleDiscoverCategoryCountryCombos, "seo_pages"],
  ["GET", "/en/api/super/seo-pages-countries-search", h.handleSearchCountriesForSeoPages, "seo_pages"],
  ["GET", "/en/api/super/seo-pages-eligible-casinos", h.handleGetEligibleCasinosForSeoPage, "seo_pages"],
  // Base category hub pages have no country context (unlike
  // seo-pages' category_country combo pages) — this returns every
  // casino already in the category, matching what the category
  // page's own automatic grid shows.
  ["GET", "/en/api/super/category-eligible-casinos", h.handleGetEligibleCasinosForCategory, "categories"],
  ["GET", "/en/api/super/seo-pages", h.handleListSeoPages, "seo_pages"],
  ["GET", "/en/api/super/seo-pages/:id", h.handleGetSeoPage, "seo_pages"],
  ["POST", "/en/api/super/seo-pages", h.handleCreateSeoPage, "seo_pages"],
  ["PUT", "/en/api/super/seo-pages/:id", h.handleUpdateSeoPage, "seo_pages"],
  ["DELETE", "/en/api/super/seo-pages/:id", h.handleDeleteSeoPage, "seo_pages"],

  // Affiliate Partner & Program Management (System 1)
  ["GET", "/en/api/super/affiliate-partners", ah.handleListPartners, "affiliate_partners"],
  ["GET", "/en/api/super/affiliate-partners/:id", ah.handleGetPartner, "affiliate_partners"],
  ["POST", "/en/api/super/affiliate-partners", ah.handleCreatePartner, "affiliate_partners"],
  ["PUT", "/en/api/super/affiliate-partners/:id", ah.handleUpdatePartner, "affiliate_partners"],
  ["DELETE", "/en/api/super/affiliate-partners/:id", ah.handleDeletePartner, "affiliate_partners"],

  ["GET", "/en/api/super/affiliate-programs", ah.handleListPrograms, "affiliate_programs"],
  ["GET", "/en/api/super/affiliate-programs/:id", ah.handleGetProgram, "affiliate_programs"],
  ["POST", "/en/api/super/affiliate-programs", ah.handleCreateProgram, "affiliate_programs"],
  ["PUT", "/en/api/super/affiliate-programs/:id", ah.handleUpdateProgram, "affiliate_programs"],
  ["DELETE", "/en/api/super/affiliate-programs/:id", ah.handleDeleteProgram, "affiliate_programs"],

  ["GET", "/en/api/super/affiliate-accounts", ah.handleListAccounts, "affiliate_accounts"],
  ["GET", "/en/api/super/affiliate-accounts/:id", ah.handleGetAccount, "affiliate_accounts"],
  ["POST", "/en/api/super/affiliate-accounts", ah.handleCreateAccount, "affiliate_accounts"],
  ["PUT", "/en/api/super/affiliate-accounts/:id", ah.handleUpdateAccount, "affiliate_accounts"],
  ["DELETE", "/en/api/super/affiliate-accounts/:id", ah.handleDeleteAccount, "affiliate_accounts"],

  // Commercial Terms -- read + create only; see handlers-affiliate.js
  // header comment for why PUT deliberately rejects rather than
  // silently no-op'ing or corrupting the versioned history.
  ["GET", "/en/api/super/commercial-terms", ah.handleListTerms, "commercial_terms"],
  ["GET", "/en/api/super/commercial-terms/:id", ah.handleGetTerm, "commercial_terms"],
  ["POST", "/en/api/super/commercial-terms", ah.handleCreateTerm, "commercial_terms"],
  ["PUT", "/en/api/super/commercial-terms/:id", ah.handleUpdateTerm, "commercial_terms"],

  // Offers (System 2) -- no DELETE by design, see migration 0024.
  ["GET", "/en/api/super/offers", ah.handleListOffers, "offers"],
  ["GET", "/en/api/super/offers/:id", ah.handleGetOffer, "offers"],
  ["POST", "/en/api/super/offers", ah.handleCreateOffer, "offers"],
  ["PUT", "/en/api/super/offers/:id", ah.handleUpdateOffer, "offers"],

  // Tracking Links (System 3) -- no DELETE by design, see migration 0025.
  ["GET", "/en/api/super/tracking-links", ah.handleListTrackingLinks, "tracking_links"],
  ["GET", "/en/api/super/tracking-links/:id", ah.handleGetTrackingLink, "tracking_links"],
  ["POST", "/en/api/super/tracking-links", ah.handleCreateTrackingLink, "tracking_links"],
  ["PUT", "/en/api/super/tracking-links/:id", ah.handleUpdateTrackingLink, "tracking_links"],

  // Postback Configs -- deliberately admin-only, no editor permission
  // rows on the tenant itself (migration 0033). See handlers-affiliate.js
  // section header for why this stays on the same trusted-credential
  // Super API model anyway, gated super-admin-only on the control
  // plane's own side instead.
  ["GET", "/en/api/super/postback-configs", ah.handleListPostbackConfigs, "postback_configs"],
  ["GET", "/en/api/super/postback-configs/:id", ah.handleGetPostbackConfig, "postback_configs"],
  ["POST", "/en/api/super/postback-configs", ah.handleCreatePostbackConfig, "postback_configs"],
  ["PUT", "/en/api/super/postback-configs/:id", ah.handleUpdatePostbackConfig, "postback_configs"],
  ["POST", "/en/api/super/postback-configs/:id/rotate-token", ah.handleRotatePostbackToken, "postback_configs"],
  ["DELETE", "/en/api/super/postback-configs/:id", ah.handleArchivePostbackConfig, "postback_configs"],

  // Provider Adapter Configs -- same no-editor-rows treatment, see
  // migration 0035.
  ["GET", "/en/api/super/provider-adapters", ah.handleListProviderAdapters, "provider_adapter_configs"],
  ["GET", "/en/api/super/provider-adapters/:id", ah.handleGetProviderAdapter, "provider_adapter_configs"],
  ["POST", "/en/api/super/provider-adapters", ah.handleCreateProviderAdapter, "provider_adapter_configs"],
  ["PUT", "/en/api/super/provider-adapters/:id", ah.handleUpdateProviderAdapter, "provider_adapter_configs"],
  ["DELETE", "/en/api/super/provider-adapters/:id", ah.handleArchiveProviderAdapter, "provider_adapter_configs"],

  // Import Batches -- read-only history, see handlers-affiliate.js
  // section header for why there's no create route.
  ["GET", "/en/api/super/import-batches", ah.handleListImportBatches, "import_batches"],
  ["GET", "/en/api/super/import-batches/:id", ah.handleGetImportBatch, "import_batches"],

  // Analytics (v8) -- tenant-wide AGGREGATE data only, see
  // handlers-analytics.js header comment for exactly what is and
  // isn't exposed here and why.
  ["GET", "/en/api/super/analytics-overview", anh.handleAnalyticsOverview, "analytics"],
  ["GET", "/en/api/super/analytics-revenue", anh.handleAnalyticsRevenue, "analytics"],
  ["GET", "/en/api/super/tracking-health", anh.handleTrackingHealth, "analytics"],
  // v15: GEO breakdown, scheduled-job health, and the dashboard's manual runs.
  ["GET", "/en/api/super/analytics-geo", anh.handleAnalyticsGeo, "analytics"],
  ["GET", "/en/api/super/analytics-health", anh.handleAnalyticsHealth, "analytics"],
  ["POST", "/en/api/super/analytics-aggregate", anh.handleAnalyticsAggregate, "analytics"],
  ["POST", "/en/api/super/analytics-evaluate-alerts", anh.handleAnalyticsEvaluateAlerts, "analytics"],
  ["POST", "/en/api/super/analytics-run-due-reports", anh.handleAnalyticsRunDueReports, "analytics"],

  // Reports (v9) -- see handlers-reporting.js header comment for exactly
  // what's exposed and why report output is treated as the same trust
  // tier as the v8 analytics endpoints rather than a bigger exposure.
  ["GET", "/en/api/super/reports", rh.handleListReports, "reports"],
  ["GET", "/en/api/super/reports/:id", rh.handleGetReport, "reports"],
  ["POST", "/en/api/super/reports", rh.handleCreateReport, "reports"],
  ["POST", "/en/api/super/reports/:id/run", rh.handleRunReport, "reports"],
  ["GET", "/en/api/super/report-column-options", rh.handleReportColumnOptions, "reports"],

  // Campaigns (v9) -- full CRUD, campaign metadata only (no financial
  // or per-visitor data), same access level as other simple resources
  // already exposed through this API.
  ["GET", "/en/api/super/campaigns", rh.handleListCampaigns, "campaigns"],
  ["GET", "/en/api/super/campaigns/:id", rh.handleGetCampaign, "campaigns"],
  ["POST", "/en/api/super/campaigns", rh.handleCreateCampaign, "campaigns"],
  ["PUT", "/en/api/super/campaigns/:id", rh.handleUpdateCampaign, "campaigns"],

  // Alerts (v9) -- mirrors the tenant dashboard's own capability split
  // (rule create/delete is admin-only there; Super API's credential is
  // already tenant-wide-admin-equivalent, consistent with everywhere
  // else in this file).
  ["GET", "/en/api/super/alert-rules", rh.handleListAlertRules, "alerts"],
  ["POST", "/en/api/super/alert-rules", rh.handleCreateAlertRule, "alerts"],
  ["GET", "/en/api/super/alerts", rh.handleListAlerts, "alerts"],
  ["POST", "/en/api/super/alerts/:id/acknowledge", rh.handleAcknowledgeAlert, "alerts"],

  // Editorial AI Tools (v10) -- generation-only wrappers around
  // en/worker/ai/admin-tools.js, see handlers-ai.js header for exactly
  // what is and isn't exposed (no arbitrary ai-command passthrough).
  ["GET", "/en/api/super/ai/availability", aih.handleAiAvailability, "ai_tools"],
  ["POST", "/en/api/super/ai/generate-review", aih.handleGenerateReview, "ai_tools"],
  ["POST", "/en/api/super/ai/generate-seo", aih.handleGenerateSeoCopy, "ai_tools"],
  ["POST", "/en/api/super/ai/generate-faqs", aih.handleGenerateFaqs, "ai_tools"],
  ["POST", "/en/api/super/ai/generate-schema", aih.handleGenerateSchema, "ai_tools"],
  ["POST", "/en/api/super/ai/generate-outline", aih.handleGenerateOutline, "ai_tools"],
  ["POST", "/en/api/super/ai/improve-content", aih.handleImproveContent, "ai_tools"],
  ["POST", "/en/api/super/ai/suggest-links", aih.handleSuggestInternalLinks, "ai_tools"],

  // Newsroom Taxonomy (v12) -- sections, topics, entities, series.
  // Thin wrapper around worker/database/newsroom-taxonomy.js's
  // existing generic listTaxonomy/saveTaxonomyItem/archiveTaxonomyItem
  // (added with migration 0054_newsroom_foundation.sql; the tenant's
  // own admin UI already manages these). DELETE always archives
  // (active = 0) -- these tables never hard-delete rows, matching
  // the tenant's own design (article <-> taxonomy links and public
  // URLs must never dangle). Article-level assignment of topics/
  // entities/series/countries to a specific article
  // (setArticleRelations) is NOT exposed yet -- this phase covers
  // managing the taxonomy terms themselves, not per-article tagging.
  ["GET", "/en/api/super/newsroom-sections", nh.handleListSections, "newsroom-sections"],
  ["GET", "/en/api/super/newsroom-sections/:id", nh.handleGetSection, "newsroom-sections"],
  ["POST", "/en/api/super/newsroom-sections", nh.handleCreateSection, "newsroom-sections"],
  ["PUT", "/en/api/super/newsroom-sections/:id", nh.handleUpdateSection, "newsroom-sections"],
  ["DELETE", "/en/api/super/newsroom-sections/:id", nh.handleArchiveSection, "newsroom-sections"],

  ["GET", "/en/api/super/newsroom-topics", nh.handleListTopics, "newsroom-topics"],
  ["GET", "/en/api/super/newsroom-topics/:id", nh.handleGetTopic, "newsroom-topics"],
  ["POST", "/en/api/super/newsroom-topics", nh.handleCreateTopic, "newsroom-topics"],
  ["PUT", "/en/api/super/newsroom-topics/:id", nh.handleUpdateTopic, "newsroom-topics"],
  ["DELETE", "/en/api/super/newsroom-topics/:id", nh.handleArchiveTopic, "newsroom-topics"],

  ["GET", "/en/api/super/newsroom-entities", nh.handleListEntities, "newsroom-entities"],
  ["GET", "/en/api/super/newsroom-entities/:id", nh.handleGetEntity, "newsroom-entities"],
  ["POST", "/en/api/super/newsroom-entities", nh.handleCreateEntity, "newsroom-entities"],
  ["PUT", "/en/api/super/newsroom-entities/:id", nh.handleUpdateEntity, "newsroom-entities"],
  ["DELETE", "/en/api/super/newsroom-entities/:id", nh.handleArchiveEntity, "newsroom-entities"],

  ["GET", "/en/api/super/newsroom-series", nh.handleListSeries, "newsroom-series"],
  ["GET", "/en/api/super/newsroom-series/:id", nh.handleGetSeries, "newsroom-series"],
  ["POST", "/en/api/super/newsroom-series", nh.handleCreateSeries, "newsroom-series"],
  ["PUT", "/en/api/super/newsroom-series/:id", nh.handleUpdateSeries, "newsroom-series"],
  ["DELETE", "/en/api/super/newsroom-series/:id", nh.handleArchiveSeries, "newsroom-series"],

  // Article-level newsroom metadata + relations (v13) -- operates on
  // an EXISTING article by its numeric news.id (see handlers-newsroom.js
  // header for why this differs from handleUpdateNews's slug-based id).
  ["GET", "/en/api/super/news/:id/newsroom-relations", nh.handleGetArticleRelations, "news"],
  ["PUT", "/en/api/super/news/:id/newsroom-meta", nh.handleSetArticleMeta, "news"],
  ["PUT", "/en/api/super/news/:id/newsroom-relations", nh.handleSetArticleRelations, "news"],

  // Research Engine Phase 2 (v14) -- sources (global) + claims
  // (scoped to a research_item_id) + the claim<->source evidence
  // links. Thin wrapper around worker/database/research-sources.js
  // and worker/database/research-claims.js (added with migration
  // 0046_research_sources_claims.sql; the tenant's own
  // /api/v1/research-sources/* and /api/v1/research-claims/* admin
  // routes already use these unmodified). DELETE on a source is a
  // real hard delete (global table, no citation-count guard on the
  // tenant's own admin route either); claims/claim-sources cascade
  // via their own foreign keys. Relations/versions/review-queue/
  // datasets (the other four research sub-systems) are NOT exposed
  // yet -- deferred to a later phase.
  ["GET", "/en/api/super/research-sources", rsh.handleListResearchSources, "research_sources"],
  ["GET", "/en/api/super/research-sources/:id", rsh.handleGetResearchSource, "research_sources"],
  ["POST", "/en/api/super/research-sources", rsh.handleCreateResearchSource, "research_sources"],
  ["PUT", "/en/api/super/research-sources/:id", rsh.handleUpdateResearchSource, "research_sources"],
  ["DELETE", "/en/api/super/research-sources/:id", rsh.handleDeleteResearchSource, "research_sources"],

  ["GET", "/en/api/super/research-claims", rsh.handleListResearchClaims, "research_claims"],
  ["GET", "/en/api/super/research-claims/:id", rsh.handleGetResearchClaim, "research_claims"],
  ["POST", "/en/api/super/research-claims", rsh.handleCreateResearchClaim, "research_claims"],
  ["PUT", "/en/api/super/research-claims/:id", rsh.handleUpdateResearchClaim, "research_claims"],
  ["DELETE", "/en/api/super/research-claims/:id", rsh.handleDeleteResearchClaim, "research_claims"],

  ["POST", "/en/api/super/research-claim-sources", rsh.handleAttachResearchClaimSource, "research_claims"],
  ["DELETE", "/en/api/super/research-claim-sources/:id", rsh.handleDetachResearchClaimSource, "research_claims"]
];

function matchRoute(method, path) {
  for (const [routeMethod, pattern, handler, resource] of ROUTES) {
    if (routeMethod !== method) continue;

    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = path.split("/").filter(Boolean);

    if (patternParts.length !== pathParts.length) continue;

    let param = null;
    let matched = true;

    for (let i = 0; i < patternParts.length; i++) {
      const pp = patternParts[i];
      if (pp.startsWith(":")) {
        param = decodeURIComponent(pathParts[i]);
        continue;
      }
      if (pp !== pathParts[i]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return { handler, resource, param };
    }
  }

  return null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function actionForMethod(method) {
  switch (method) {
    case "GET":
      return "read";
    case "POST":
      return "create";
    case "PUT":
      return "update";
    case "DELETE":
      return "delete";
    default:
      return method.toLowerCase();
  }
}

/**
 * Entry point for all /en/api/super/* requests.
 * Wired from routes.js / index.js — see rule #7/#9/#10/#25.
 */
export async function handleSuperApi(request, env, ctx, path) {
  const method = request.method.toUpperCase();
  const requestId = crypto.randomUUID();

  const match = matchRoute(method, path);

  if (!match) {
    return json({ success: false, error: "not_found" }, 404);
  }

  // Read the body once as text (needed both for signature
  // verification and for JSON parsing in the handler).
  let bodyText = "";
  if (method === "POST" || method === "PUT" || method === "DELETE") {
    try {
      bodyText = await request.text();
    } catch (_) {
      bodyText = "";
    }
  }

  const verification = await verifySuperApiRequest(request, env, path, bodyText);

  if (!verification.ok) {
    await logSuperApiRequest(env, {
      credentialId: null,
      endpoint: path,
      method,
      resource: match.resource,
      resourceId: match.param,
      action: actionForMethod(method),
      success: false,
      statusCode: verification.status,
      requestId
    });

    const publicMessage =
      verification.status === 429 ? "rate_limited" : "unauthorized";

    return json({ success: false, error: publicMessage }, verification.status);
  }

  try {
    const response = await match.handler(
      request,
      env,
      match.param,
      bodyText
    );

    await logSuperApiRequest(env, {
      credentialId: verification.credentialId,
      endpoint: path,
      method,
      resource: match.resource,
      resourceId: match.param,
      action: actionForMethod(method),
      success: response.status < 400,
      statusCode: response.status,
      requestId
    });

    return response;
  } catch (error) {
    await logSuperApiRequest(env, {
      credentialId: verification.credentialId,
      endpoint: path,
      method,
      resource: match.resource,
      resourceId: match.param,
      action: actionForMethod(method),
      success: false,
      statusCode: 500,
      requestId
    });

    return json({ success: false, error: "internal_error" }, 500);
  }
}
