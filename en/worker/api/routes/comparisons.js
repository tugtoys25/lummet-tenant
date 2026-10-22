// Comparisons.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import { getComparableFields } from "../../comparison-fields.js";
import { getComparisonDesign, saveComparisonDesign, deleteComparisonDesign } from "../../comparison-design.js";
import { logAudit } from "../../database/audit.js";
import * as comparisonsDB from "../../database/comparisons.js";
import * as itemAccess from "../../database/item-access.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

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
  const opts = { search: (url.searchParams.get("search") || "").trim().slice(0, 80) || null, status: statusFilter || null, extraCondition: condition || null, extraParams: params, limit: page != null ? perPage : 200, offset: page != null ? (page - 1) * perPage : 0, withTotal: page != null };
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
  if (body.design) await saveComparisonDesign(env.DB, body.content_type, body.slug, body.design);
  await logAudit(env.DB, { userId: user.user_id, action: "create", entityType: "comparison", entityId: comparison.id, metadata: { content_type: body.content_type, slug: body.slug, title: body.title } });
  return success({ comparison });
}

if (path === "/api/v1/comparison/fields" && request.method === "GET") {
  const url = new URL(request.url);
  const fields = await getComparableFields(
    env.DB,
    url.searchParams.get("content_type") || "",
    url.searchParams.get("custom_type_slug") || ""
  );
  return json({ success: true, fields: fields.map((f) => ({ key: f.key, label: f.label, kind: f.kind })) });
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
  const design = await getComparisonDesign(env.DB, contentType, slug);
  return json({ success: true, comparison, items, design });
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
  if (body.design !== undefined) await saveComparisonDesign(env.DB, body.content_type, body.slug, body.design);
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
  await deleteComparisonDesign(env.DB, body.content_type, body.slug);
  await logAudit(env.DB, { userId: user.user_id, action: "delete", entityType: "comparison", entityId: existing.id, metadata: { content_type: body.content_type, slug: body.slug, title: existing.title } });
  return success();
}

  return NOT_HANDLED;
}
