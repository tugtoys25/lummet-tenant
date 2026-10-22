import * as settingsDB from "../../database/settings.js";
import * as adminTools from "../../database/admin_tools.js";
import { fail, filterSafeSettings, ok, readJsonBody } from "./helpers.js";

// =====================================================
// SETTINGS (safe configuration only — rule #26)
// =====================================================

export async function handleListSettings(request, env) {
  const all = await settingsDB.getAllSettings(env.DB);
  return ok({ data: filterSafeSettings(all) });
}

export async function handleUpdateSettings(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const safe = filterSafeSettings(body);

  if (Object.keys(safe).length === 0) {
    return fail("no_safe_settings_provided", 422);
  }

  await settingsDB.saveSettings(env.DB, safe);
  return ok({ data: safe });
}

// =====================================================
// USERS (list / role-only — no password reads, no
// create/delete through the Super API in Phase 1)
// =====================================================

export async function handleListUsers(request, env) {
  const rows = await adminTools.getAllUsers(env.DB);
  const safe = (rows || []).map(({ password_hash, ...rest }) => rest);
  return ok({ data: safe });
}

export async function handleGetUser(request, env, id) {
  const row = await adminTools.getUserById(env.DB, id);
  if (!row) return fail("not_found", 404);
  const { password_hash, ...safe } = row;
  return ok({ data: safe });
}

export async function handleUpdateUserRole(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.role) return fail("role_required", 422);
  await adminTools.updateUserRole(env.DB, id, body.role);
  return ok();
}

export async function handleDeleteUser(request, env, id) {
  // admin_tools.deleteUser already refuses to delete the last
  // remaining admin — that check is preserved as-is here.
  try {
    await adminTools.deleteUser(env.DB, id);
    return ok();
  } catch (error) {
    return fail(error.message || "delete_failed", 422);
  }
}
