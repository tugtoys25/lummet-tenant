// News and the newsroom.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as news from "../../database/news.js";
import * as itemAccess from "../../database/item-access.js";
import { handleNewsroomApi, beforeNewsUpdate, afterNewsUpdate, slugRedirectHook, searchReindexHook } from "../../newsroom-api.js";
import { notifyOnPublish } from "../../content-notifications.js";
import { invalidateNews } from "../../cache.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

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

  return NOT_HANDLED;
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
