// =====================================================
// SUPER API — HANDLERS (Newsroom Taxonomy: sections, topics,
// entities, series)
//
// Same convention as handlers.js/handlers-affiliate.js: thin
// wrappers around the tenant's existing worker/database/*.js module
// — here, worker/database/newsroom-taxonomy.js's generic
// listTaxonomy/saveTaxonomyItem/archiveTaxonomyItem, unmodified.
// No business logic is duplicated: slug generation, slug-uniqueness
// checks, section parent-cycle prevention, entity_type/country_code
// validation, and "archive never deletes" all still live in that one
// file, exactly as the tenant's own admin already uses it.
//
// Kept in a separate file from handlers.js purely for size; router.js
// imports this under its own namespace, same as handlers-affiliate.js
// etc.
//
// PERMISSION MODEL: newsroom-taxonomy.js's saveTaxonomyItem() calls
// checkPermission(perms, 'news', 'manage_taxonomy') internally, where
// perms === null means "admin, bypass every check" (see
// worker/database/permissions.js). The Super API's credential is
// already tenant-wide-admin-equivalent by design, consistent with
// every other write in this API (see the alert-rules/campaigns
// comment in router.js) — so SUPER_API_ACTOR below passes perms:
// null, the same sentinel the tenant's own "admin" role produces.
// actor.user_id is null because there is no tenant admin user behind
// a Super API-driven change; the caller's real identity (which
// Lummet credential, from which request) is already captured in
// super_audit_logs by router.js/auth.js for every request on this
// API regardless of this internal log.
// =====================================================

import * as taxonomyDB from "../database/newsroom-taxonomy.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
function ok(data = {}) { return json({ success: true, ...data }, 200); }
function created(data = {}) { return json({ success: true, ...data }, 201); }
function fail(message, status = 400) { return json({ success: false, error: message }, status); }

async function readJsonBody(request, bodyText) {
  if (!bodyText) return {};
  try { return JSON.parse(bodyText); } catch (_) { return {}; }
}

const SUPER_API_ACTOR = { actor: { user_id: null }, perms: null };

function makeListHandler(kind) {
  return async function handleList(request, env) {
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get("include_inactive") === "1";
    const rows = await taxonomyDB.listTaxonomy(env.DB, kind, { includeInactive });
    if (rows === null) return fail("unknown_taxonomy_kind", 404);
    return ok({ data: rows });
  };
}

function makeGetHandler(kind) {
  return async function handleGet(request, env, id) {
    const row = await taxonomyDB.getTaxonomyItem(env.DB, kind, id);
    if (row === null) return fail("unknown_taxonomy_kind", 404);
    if (row === undefined) return fail("not_found", 404);
    return ok({ data: row });
  };
}

function makeCreateHandler(kind) {
  return async function handleCreate(request, env, _id, bodyText) {
    const body = await readJsonBody(request, bodyText);
    const result = await taxonomyDB.saveTaxonomyItem(env.DB, kind, body, SUPER_API_ACTOR);
    if (!result.ok) return fail(result.error, result.status || 400);
    return created({ data: { id: result.id, slug: result.slug } });
  };
}

function makeUpdateHandler(kind) {
  return async function handleUpdate(request, env, id, bodyText) {
    const body = await readJsonBody(request, bodyText);
    const result = await taxonomyDB.saveTaxonomyItem(env.DB, kind, { ...body, id }, SUPER_API_ACTOR);
    if (!result.ok) return fail(result.error, result.status || 400);
    return ok({ data: { id: result.id } });
  };
}

function makeArchiveHandler(kind) {
  // DELETE never hard-deletes here — it archives (active = 0), matching
  // newsroom-taxonomy.js's own design ("Nothing here deletes taxonomy
  // rows: links and public URLs must never dangle/404"). Restoring is a
  // PUT with { "active": true }, same route as any other field update.
  return async function handleArchive(request, env, id) {
    const result = await taxonomyDB.archiveTaxonomyItem(env.DB, kind, id, { ...SUPER_API_ACTOR, active: false });
    if (!result.ok) return fail(result.error, result.status || 400);
    return ok();
  };
}

export const handleListSections = makeListHandler("sections");
export const handleGetSection = makeGetHandler("sections");
export const handleCreateSection = makeCreateHandler("sections");
export const handleUpdateSection = makeUpdateHandler("sections");
export const handleArchiveSection = makeArchiveHandler("sections");

export const handleListTopics = makeListHandler("topics");
export const handleGetTopic = makeGetHandler("topics");
export const handleCreateTopic = makeCreateHandler("topics");
export const handleUpdateTopic = makeUpdateHandler("topics");
export const handleArchiveTopic = makeArchiveHandler("topics");

export const handleListEntities = makeListHandler("entities");
export const handleGetEntity = makeGetHandler("entities");
export const handleCreateEntity = makeCreateHandler("entities");
export const handleUpdateEntity = makeUpdateHandler("entities");
export const handleArchiveEntity = makeArchiveHandler("entities");

export const handleListSeries = makeListHandler("series");
export const handleGetSeries = makeGetHandler("series");
export const handleCreateSeries = makeCreateHandler("series");
export const handleUpdateSeries = makeUpdateHandler("series");
export const handleArchiveSeries = makeArchiveHandler("series");

// -----------------------------------------------------
// Article-level newsroom metadata + relations (v13).
// These operate on an EXISTING article by its numeric news.id —
// NOT its slug (handleUpdateNews in handlers.js uses slug; this is a
// deliberately separate identifier because setArticleMeta/
// setArticleRelations are a separate function from updateNews, and
// take a numeric id). The list endpoints above (handleListSections
// etc.) and the existing GET /en/api/super/news list both return
// their own numeric `id`, so the caller always has one available.
//
// setArticleMeta covers the public, additive columns added directly
// to `news` by migration 0054 (article_type, section_id,
// primary_country, region_slug, content_class, labels, methodology,
// pr_* fields, disclosure_json) -- NOT exposed through the ordinary
// news update endpoint, because updateNews's own UPDATE statement
// (worker/database/news.js) predates that migration and does not
// include these columns; sending them there would silently no-op.
//
// setArticleRelations covers the many-to-many links: topic_ids,
// series_ids, entities ([{id, role}]), countries ([{code}] +
// primary_country), and related ([{news_id, relation_type}]) --
// replace-set semantics per key, exactly as the tenant's own
// function implements it.
// -----------------------------------------------------

export async function handleSetArticleMeta(request, env, id, bodyText) {
  const numId = Number(id);
  if (!Number.isInteger(numId)) return fail("invalid_id", 400);
  const body = await readJsonBody(request, bodyText);
  const result = await taxonomyDB.setArticleMeta(env.DB, numId, body, SUPER_API_ACTOR);
  if (!result.ok) return fail(result.error, result.status || 400);
  return ok({ data: { changed: result.changed || [] } });
}

export async function handleGetArticleRelations(request, env, id) {
  const numId = Number(id);
  if (!Number.isInteger(numId)) return fail("invalid_id", 400);
  const article = await env.DB.prepare(`SELECT id FROM news WHERE id = ?`).bind(numId).first();
  if (!article) return fail("not_found", 404);
  const data = await taxonomyDB.getArticleRelations(env.DB, numId);
  return ok({ data });
}

export async function handleSetArticleRelations(request, env, id, bodyText) {
  const numId = Number(id);
  if (!Number.isInteger(numId)) return fail("invalid_id", 400);
  const body = await readJsonBody(request, bodyText);
  const result = await taxonomyDB.setArticleRelations(env.DB, numId, body, SUPER_API_ACTOR);
  if (!result.ok) return fail(result.error, result.status || 400);
  return ok({ data: { changed: result.changed || [] } });
}
