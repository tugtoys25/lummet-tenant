import * as navDB from "../../database/nav.js";
import * as bannersDB from "../../database/banners.js";
import { created, fail, ok, readJsonBody } from "./helpers.js";

// =====================================================
// NAV ITEMS (id-keyed)
// =====================================================

export async function handleListNavItems(request, env) {
  const rows = await navDB.getAllNavItems(env.DB);
  return ok({ data: rows });
}

export async function handleGetNavItem(request, env, id) {
  const row = await navDB.getNavItem(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateNavItem(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await navDB.createNavItem(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateNavItem(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await navDB.updateNavItem(env.DB, id, body);
  return ok();
}

export async function handleDeleteNavItem(request, env, id) {
  await navDB.deleteNavItem(env.DB, id);
  return ok();
}

// =====================================================
// BANNERS (id-keyed)
// =====================================================

export async function handleListBanners(request, env) {
  const rows = await bannersDB.getAllBanners(env.DB);
  return ok({ data: rows });
}

export async function handleGetBanner(request, env, id) {
  const row = await bannersDB.getBanner(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateBanner(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await bannersDB.createBanner(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateBanner(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await bannersDB.updateBanner(env.DB, id, body);
  return ok();
}

export async function handleDeleteBanner(request, env, id) {
  await bannersDB.deleteBanner(env.DB, id);
  return ok();
}
