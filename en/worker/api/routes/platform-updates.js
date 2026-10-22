// Platform updates.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as platformUpdates from "../../database/platform-updates.js";
import * as itemAccess from "../../database/item-access.js";
import { NOT_HANDLED, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

/* =========================================================
PLATFORM UPDATES ADMIN API========================================================= */
if (path === "/api/v1/platform-updates/list" &&request.method === "GET") {return listPlatformUpdates(request, env, user);}

if (path === "/api/v1/platform-updates/create" &&request.method === "POST") {return createPlatformUpdate(request, env, user);}

if (path === "/api/v1/platform-updates/update" &&request.method === "POST") {return updatePlatformUpdate(request, env, user);}

if (path === "/api/v1/platform-updates/delete" &&request.method === "POST") {return deletePlatformUpdate(request, env, user);}

  return NOT_HANDLED;
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
