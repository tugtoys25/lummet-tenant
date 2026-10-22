import * as platformUpdatesDB from "../../database/platform-updates.js";
import { created, fail, ok, readJsonBody } from "./helpers.js";

// =====================================================
// PLATFORM UPDATES (id-keyed) — the tenant's changelog/announcements
// feature (en/worker/database/platform-updates.js). Not previously
// exposed on the Super API at all.
// =====================================================

export async function handleListPlatformUpdates(request, env) {
  const rows = await platformUpdatesDB.getAllPlatformUpdates(env.DB);
  return ok({ data: rows });
}

export async function handleGetPlatformUpdate(request, env, id) {
  const row = await platformUpdatesDB.getPlatformUpdateById(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreatePlatformUpdate(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.slug || !body.title || !body.content) {
    return fail("slug_title_and_content_required", 422);
  }
  const result = await platformUpdatesDB.createPlatformUpdate(env.DB, body);
  return created({ data: { id: result.meta?.last_row_id } });
}

export async function handleUpdatePlatformUpdate(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.slug || !body.title || !body.content) {
    return fail("slug_title_and_content_required", 422);
  }
  await platformUpdatesDB.updatePlatformUpdate(env.DB, id, body);
  return ok();
}

export async function handleDeletePlatformUpdate(request, env, id) {
  await platformUpdatesDB.deletePlatformUpdate(env.DB, id);
  return ok();
}
