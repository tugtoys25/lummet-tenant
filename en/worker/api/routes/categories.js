// Categories.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as categories from "../../database/categories.js";
import { invalidateCategories, invalidateNav } from "../../cache.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path }) {

// List categories
if (path === "/api/v1/categories/list") {
  const result = await env.DB.prepare(`
    SELECT * FROM categories ORDER BY name
  `).all();
  return json({ categories: result.results });
}

    // ==================================
    // CATEGORIES CRUD
    // ==================================
    if (path === "/api/v1/category/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "name"]);
      await categories.createCategory(env.DB, body);
      await invalidateCategories(env);
      await invalidateNav(env);
      return success();
    }

    if (path === "/api/v1/category/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "name"]);
      const { updateCategory } = await import("../../database/categories.js");
      await updateCategory(env.DB, body.slug, body);
      await invalidateCategories(env);
      await invalidateNav(env);
      return success();
    }
    if (path === "/api/v1/category/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug"]);
      const { deleteCategory } = await import("../../database/categories.js");
      await deleteCategory(env.DB, body.slug);
      await invalidateCategories(env);
      await invalidateNav(env);
      return success();
    }

    // Section-level casino pickers on the base category hub page
    // (countries.html/categories.html "Content sections" builder)
    // have no country context, unlike seo-pages' eligible-casinos —
    // they pull every casino already in this category, matching
    // exactly what the category page's own automatic grid shows.
    if (path === "/api/v1/category/eligible-casinos" && request.method === "GET") {
      const urlObj = new URL(request.url);
      const slug = urlObj.searchParams.get("slug");
      if (!slug) return failure("slug is required", 422);
      const rows = await categories.getCategoryCasinos(env.DB, slug);
      return json({ success: true, casinos: rows });
    }
        // ==================================
    // CATEGORY GET BY ID (for edit)
    // ==================================

    if (path === "/api/v1/category/get-by-id" && request.method === "GET") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const { getCategoryById } = await import("../../database/categories.js");
      const category = await getCategoryById(env.DB, id);
      if (!category) return failure("Category not found", 404);
      return json({ success: true, category });
    }

  return NOT_HANDLED;
}
