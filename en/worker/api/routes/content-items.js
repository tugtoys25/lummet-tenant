// Generic content items, sports and currencies lists, enabled content types.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import { logAudit } from "../../database/audit.js";
import * as contentItemsDB from "../../database/content-items.js";
import * as customTypesDB from "../../database/custom-types.js";
import { getContentTypeEnablement, updateContentTypeEnablement } from "../../content-types.js";
import * as itemAccess from "../../database/item-access.js";
import { sanitizeUrl } from "../../sanitize.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

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
  if (!geoCheck.rules || !geoCheck.rules.length) { const { applyDefaultToNewItem } = await import("../../geo-manager.js"); await applyDefaultToNewItem(env.DB, env, body.content_type, String(item.id)); }
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

  return NOT_HANDLED;
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
