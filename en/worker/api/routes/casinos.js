// Casinos: create, update, delete, list, get.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as casinos from "../../database/casinos.js";
import * as offersDB from "../../database/offers.js";
import * as trackingLinksDB from "../../database/tracking-links.js";
import * as itemAccess from "../../database/item-access.js";
import { notifyOnPublish } from "../../content-notifications.js";
import { invalidateCasinos } from "../../cache.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

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

  return NOT_HANDLED;
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
  { const { applyDefaultToNewItem } = await import("../../geo-manager.js"); await applyDefaultToNewItem(env.DB, env, "casino", body.slug); }
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
