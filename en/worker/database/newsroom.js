// ============================================================
// en/worker/database/newsroom.js
// Newsroom services layer (Stage B). Additive: nothing imports this yet,
// so it cannot change existing behaviour until Stage C/D wire it in.
//
// Conventions kept from the codebase:
//   * vocabularies validated here in JS, not via SQL CHECK
//   * prepared statements only; no string-built SQL from input
//   * audit via logAudit() (never throws)
//   * permission checks via permissions.checkPermission(userPerms,'news',action)
//     where userPerms comes from getPermissionsForUser() (null = admin)
//
// PUBLIC vs INTERNAL: every get*Public* loader selects an explicit column
// list. Internal data (news_editorial, news_editorial_notes, revisions,
// created_by) is only reachable through the admin-only functions below.
// ============================================================

// The code lives in newsroom/*.js (see docs/ARCHITECTURE_NEWSROOM.md); this file keeps the public import path.
export { ARTICLE_TYPES, CONTENT_CLASSES, LABELS, SOURCE_TYPES, CORRECTION_TYPES, RELATION_TYPES, FACT_CHECK_STATUSES, WORKFLOW_STATUSES, isNewsFlagEnabled, plainText, slugify, validatePublicUrl } from "./newsroom/base.js";
export { normalizeSource, replaceArticleSources, TRACKED_FIELDS, diffArticle, recordRevision, listRevisions, getRevision, addCorrection, canTransition, requiredActionFor, getEffectiveStatus, transitionWorkflow, getEditorialState, setFactCheck, assertSectionSlugFree, createSection } from "./newsroom/editorial.js";
export { getPublicSources, getPublicCorrections, getPublicTimeline, getPublicSection, loadArticleExtras, PUBLIC_FLAG_KEYS, resetNewsFlagCache, getNewsFlags, getPublicRelated, loadPublicNewsroom, getSectionBySlug, getSectionIds, getSectionArticles, findSlugCollisions } from "./newsroom/public.js";
export { recordSlugRedirect, getRedirectTarget, getRegionBySlug, resetCountryCache, getCountryBySlug, getCountryByCode, getCountryArticles, getRegionArticles, getTopicArticles, getEntityArticles, getSeriesArticles, getTopicBySlug, getSeriesBySlug, getEntityBySlug, setRegionCountries, loadDiscovery, getLandingSitemapEntries } from "./newsroom/discovery.js";
