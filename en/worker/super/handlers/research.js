import * as researchDB from "../../database/research.js";
import { created, fail, ok, readJsonBody } from "./helpers.js";

// =====================================================
// RESEARCH ZONE (research_items) -- id-keyed, same thin-wrapper
// shape as categories/updates above. Wraps worker/database/
// research.js exactly (no duplicated validation): createResearchItem/
// updateResearchItem already throw on an invalid `type`, which
// readJsonBody's caller (router.js) surfaces as a plain 400 the
// same way every other resource's DB-level validation does.
// =====================================================

export async function handleListResearch(request, env) {
  const rows = await researchDB.getAllResearchItems(env.DB);
  return ok({ data: rows });
}

export async function handleGetResearch(request, env, id) {
  const row = await researchDB.getResearchItemById(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateResearch(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    const result = await researchDB.createResearchItem(env.DB, body);
    return created({ data: { id: result.meta.last_row_id } });
  } catch (error) {
    return fail(error.message || "create_failed", 422);
  }
}

export async function handleUpdateResearch(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    await researchDB.updateResearchItem(env.DB, id, body);
    return ok();
  } catch (error) {
    return fail(error.message || "update_failed", 422);
  }
}

export async function handleDeleteResearch(request, env, id) {
  await researchDB.deleteResearchItem(env.DB, id);
  return ok();
}
