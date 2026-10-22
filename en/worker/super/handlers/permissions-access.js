import * as permissionsDB from "../../database/permissions.js";
import * as itemAccessDB from "../../database/item-access.js";
import { fail, ok, readJsonBody } from "./helpers.js";

// =====================================================
// PERMISSIONS (role/resource/action matrix — not a normal
// id-keyed CRUD resource; the client reads/writes the whole
// matrix or one cell at a time)
// =====================================================

export async function handleListPermissions(request, env) {
  const matrix = await permissionsDB.getPermissionMatrix(env.DB);
  const rows = await permissionsDB.getAllPermissions(env.DB);
  return ok({ data: { matrix, rows } });
}

// PUT body: { role, resource, action, allowed }
export async function handleSetPermission(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.role || !body.resource || !body.action) {
    return fail("role_resource_and_action_required", 422);
  }
  await permissionsDB.setPermission(env.DB, body.role, body.resource, body.action, !!body.allowed);
  return ok();
}

export async function handleDeletePermission(request, env, id) {
  await permissionsDB.deletePermission(env.DB, id);
  return ok();
}

// =====================================================
// ITEM-LEVEL ACCESS
// Wraps en/worker/database/item-access.js — the same module the
// tenant's own (unmounted) item-access-api.js already wraps, so no
// authorization logic is duplicated here. Sits ON TOP of the
// role/resource/action permissions above: permissions decide
// whether a role can act on a resource at all; this decides WHICH
// items of that resource a given user can act on
// (none/own/all/assigned).
// =====================================================

// GET — the whole picture for one user: their per-resource/action
// scopes, the system default, and (to avoid needing per-resource
// query params, which this Super API's request signature doesn't
// cover) their specific item assignments across every registered
// resource in one shot.
export async function handleGetUserItemAccess(request, env, userId) {
  const uid = Number(userId);
  const access = await itemAccessDB.getAllUserItemAccess(env.DB, uid);
  const defaultScope = await itemAccessDB.getSystemDefaultScope(env.DB);
  const resources = itemAccessDB.getRegisteredResources();
  const assignments = {};
  for (const resource of resources) {
    assignments[resource] = await itemAccessDB.getAccessibleItemIds(env.DB, uid, resource);
  }
  return ok({ data: { access, defaultScope, resources, assignments } });
}

// PUT body: { resource, action, scope }
export async function handleSetUserItemAccess(request, env, userId, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.resource || !body.action || !body.scope) {
    return fail("resource_action_and_scope_required", 422);
  }
  try {
    await itemAccessDB.setUserItemAccess(env.DB, Number(userId), body.resource, body.action, body.scope);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

// PUT body: { resource, item_id, assigned }. A single endpoint for
// both granting and revoking one item, so this never needs DELETE
// with a body (which this control plane's client can't send — its
// request signature is computed over the exact bytes sent).
export async function handleSetItemAssignment(request, env, userId, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.resource || body.item_id == null) {
    return fail("resource_and_item_id_required", 422);
  }
  if (body.assigned) {
    await itemAccessDB.assignItem(env.DB, Number(userId), body.resource, Number(body.item_id));
  } else {
    await itemAccessDB.unassignItem(env.DB, Number(userId), body.resource, Number(body.item_id));
  }
  return ok();
}

export async function handleGetItemAccessDefaults(request, env) {
  const scope = await itemAccessDB.getSystemDefaultScope(env.DB);
  const resources = itemAccessDB.getRegisteredResources();
  return ok({ data: { scope, resources } });
}

// PUT body: { scope }
export async function handleSetItemAccessDefaultScope(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.scope) return fail("scope_required", 422);
  try {
    await itemAccessDB.setSystemDefaultScope(env.DB, body.scope);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}
