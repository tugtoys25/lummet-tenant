import * as pagesDB from "../../database/pages.js";
import * as categoriesDB from "../../database/categories.js";
import { created, fail, ok, readJsonBody, validateRequired } from "./helpers.js";

// =====================================================
// PAGES
// =====================================================

export async function handleListPages(request, env) {
  const rows = await pagesDB.getAllPages(env.DB);
  return ok({ data: rows });
}

export async function handleGetPage(request, env, slug) {
  const row = await pagesDB.getPage(env.DB, slug);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreatePage(request, env, _slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["slug", "type", "template", "title"]);
    const id = await pagesDB.createPage(env.DB, body);
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdatePage(request, env, slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["title"]);
    await pagesDB.updatePage(env.DB, slug, body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDeletePage(request, env, slug) {
  await pagesDB.deletePage(env.DB, slug);
  return ok();
}

// =====================================================
// CATEGORIES
// =====================================================

export async function handleListCategories(request, env) {
  const rows = await categoriesDB.getAllCategories(env.DB);
  return ok({ data: rows });
}

export async function handleGetCategory(request, env, slug) {
  const row = await categoriesDB.getCategory(env.DB, slug);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateCategory(request, env, _slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  const id = await categoriesDB.createCategory(env.DB, body);
  return created({ data: { id } });
}

export async function handleUpdateCategory(request, env, slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await categoriesDB.updateCategory(env.DB, slug, body);
  return ok();
}

export async function handleDeleteCategory(request, env, slug) {
  await categoriesDB.deleteCategory(env.DB, slug);
  return ok();
}
