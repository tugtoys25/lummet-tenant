// Pages.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as pages from "../../database/pages.js";
import * as itemAccess from "../../database/item-access.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

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

    if (path === "/api/v1/page/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug"]);

      const existing = await itemAccess.getItemBySlug(env.DB, 'pages', body.slug);
      if (!existing) return failure("Page not found", 404);
      const canDelete = await itemAccess.canAccessItem(env.DB, user, 'pages', 'delete', existing);
      if (!canDelete) return failure("Page not found", 404);

      const { deletePage } = await import("../../database/pages.js");
      await deletePage(env.DB, body.slug);
      return success();
    }

  return NOT_HANDLED;
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
