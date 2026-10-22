// Custom content types.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import { logAudit } from "../../database/audit.js";
import * as customTypesDB from "../../database/custom-types.js";
import { isReservedSlug } from "../../reserved-slugs.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

if (path === "/api/v1/custom-types/list" && request.method === "GET") {
  const url = new URL(request.url);
  const page = url.searchParams.has("page") ? Math.max(1, parseInt(url.searchParams.get("page")) || 1) : null;
  const perPage = Math.min(200, Math.max(1, parseInt(url.searchParams.get("per_page")) || 25));
  if (page == null) {
    const types = await customTypesDB.getAllCustomContentTypes(env.DB);
    return json({ success: true, types });
  }
  const result = await customTypesDB.getAllCustomContentTypes(env.DB, { limit: perPage, offset: (page - 1) * perPage });
  return json({ success: true, types: result.items, total: result.total, page, per_page: perPage });
}

if (path === "/api/v1/custom-type/create" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["slug", "label", "plural_label"]);
  try {
    const type = await customTypesDB.createCustomContentType(env.DB, {
      slug: body.slug, label: body.label, pluralLabel: body.plural_label, icon: body.icon || null,
      reviewEnabled: body.review_enabled !== false, comparisonEnabled: body.comparison_enabled !== false,
    }, isReservedSlug);
    if (Array.isArray(body.fields)) {
      for (let i = 0; i < body.fields.length; i++) {
        const f = body.fields[i];
        await env.DB.prepare(`
          INSERT INTO custom_field_definitions (custom_type_slug, field_key, label, field_type, options_json, required, display_order)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(type.slug, f.field_key, f.label, f.field_type, f.options_json || null, f.required ? 1 : 0, i * 10).run();
      }
    }
    await logAudit(env.DB, { userId: user.user_id, action: "create", entityType: "custom_content_type", entityId: type.id, metadata: { slug: body.slug, label: body.label } });
    return success({ type });
  } catch (e) {
    return failure(e.message, 400);
  }
}

if (path === "/api/v1/custom-type/fields" && request.method === "GET") {
  const url = new URL(request.url);
  const typeSlug = url.searchParams.get("type_slug");
  if (!typeSlug) return failure("type_slug is required");
  const fields = await customTypesDB.getCustomFieldDefinitions(env.DB, typeSlug);
  return json({ success: true, fields });
}

if (path === "/api/v1/custom-type/update" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["slug"]);
  const existing = await customTypesDB.getCustomContentType(env.DB, body.slug);
  if (!existing) return failure("Custom content type not found", 404);
  const fields = {};
  if (body.label !== undefined) fields.label = body.label;
  if (body.plural_label !== undefined) fields.pluralLabel = body.plural_label;
  if (body.icon !== undefined) fields.icon = body.icon;
  if (body.review_enabled !== undefined) fields.reviewEnabled = !!body.review_enabled;
  if (body.comparison_enabled !== undefined) fields.comparisonEnabled = !!body.comparison_enabled;
  const type = await customTypesDB.updateCustomContentType(env.DB, body.slug, fields);
  let addedFields = [];
  if (Array.isArray(body.new_fields) && body.new_fields.length) {
    addedFields = await customTypesDB.addCustomFieldDefinitions(env.DB, body.slug, body.new_fields);
  }
  // `fields` (the full array, as opposed to `new_fields` above) does a
  // full replace-and-reorder -- lets the edit screen actually remove or
  // reorder an existing field, which addCustomFieldDefinitions() can't
  // do (it's append-only by design). Mutually exclusive with
  // `new_fields` in one call; a client sends one or the other.
  let replacedFields = null;
  if (Array.isArray(body.fields)) {
    replacedFields = await customTypesDB.updateCustomFieldDefinitions(env.DB, body.slug, body.fields.map((f, i) => ({
      field_key: f.field_key, label: f.label, field_type: f.field_type,
      options_json: f.options_json || null, required: !!f.required, display_order: f.display_order ?? (i * 10),
    })));
  }
  await logAudit(env.DB, { userId: user.user_id, action: "update", entityType: "custom_content_type", entityId: type.id, metadata: { slug: body.slug, fields_added: addedFields.length, fields_replaced: replacedFields ? replacedFields.length : undefined } });
  return success({ type, addedFields, fields: replacedFields });
}

if (path === "/api/v1/custom-type/delete" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["slug"]);
  const existing = await customTypesDB.getCustomContentType(env.DB, body.slug);
  if (!existing) return failure("Custom content type not found", 404);
  const dependentCount = await customTypesDB.countContentItemsOfCustomType(env.DB, body.slug);
  if (dependentCount > 0) {
    return failure(
      `Cannot delete: ${dependentCount} content item(s) still use the "${existing.label}" type. Delete or reassign them first.`,
      409
    );
  }
  await customTypesDB.deleteCustomContentType(env.DB, body.slug);
  await logAudit(env.DB, { userId: user.user_id, action: "delete", entityType: "custom_content_type", entityId: existing.id, metadata: { slug: body.slug, label: existing.label } });
  return success();
}

  return NOT_HANDLED;
}
