// Super API routes: Editorial AI tools, newsroom taxonomy and article metadata.
// Each entry: [METHOD, path-pattern, handler, resource-name]. Order matters (first match wins);
// router.js joins the groups in the order the table always had.
import * as aih from "../handlers-ai.js";
import * as nh from "../handlers-newsroom.js";

export const AI_NEWSROOM_ROUTES = [
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
];
