import * as componentsDB from "../../database/components.js";
import { created, fail, ok, readJsonBody } from "./helpers.js";

// =====================================================
// COMPONENTS (id-keyed)
// =====================================================

export async function handleListComponents(request, env) {
  const rows = await componentsDB.getAllComponents(env.DB);
  return ok({ data: rows });
}

export async function handleGetComponent(request, env, id) {
  const row = await componentsDB.getComponent(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateComponent(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await componentsDB.createComponent(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateComponent(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await componentsDB.updateComponent(env.DB, id, body);
  return ok();
}

export async function handleDeleteComponent(request, env, id) {
  await componentsDB.deleteComponent(env.DB, id);
  return ok();
}

// =====================================================
// PAGE COMPONENTS ("blocks" — which components are placed
// on which pages, id-keyed)
// =====================================================

export async function handleListBlocks(request, env) {
  const rows = await componentsDB.getAllPageAssignments(env.DB);
  return ok({ data: rows });
}

export async function handleGetBlock(request, env, id) {
  const row = await componentsDB.getPageAssignmentById(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateBlock(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const result = await componentsDB.assignComponentToPage(env.DB, body);
  return created({ data: { id: result.meta?.last_row_id ?? null } });
}

export async function handleUpdateBlock(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await componentsDB.updatePageComponentAssignment(env.DB, id, body);
  if (body.enabled !== undefined) {
    await componentsDB.togglePageComponent(env.DB, id, body.enabled);
  }
  return ok();
}

export async function handleDeleteBlock(request, env, id) {
  await componentsDB.removePageComponent(env.DB, id);
  return ok();
}
