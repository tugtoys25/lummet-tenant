// SEO meta.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as seoMetaDB from "../../database/seo_meta.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path }) {

    // ==================================
    // SEO META CRUD
    // ==================================

    if (path === "/api/v1/seo/list") {
      const result = await seoMetaDB.getAllSeoMeta(env.DB);
      return json({ seo: result });
    }

    if (path === "/api/v1/seo/get" && request.method === "GET") {
      const url = new URL(request.url);
      const pageType = url.searchParams.get("page_type");
      const pageSlug = url.searchParams.get("page_slug");
      if (!pageType || !pageSlug) return failure("page_type and page_slug are required");
      const seo = await seoMetaDB.getSeoMeta(env.DB, pageType, pageSlug);
      return json({ seo: seo || null });
    }

    if (path === "/api/v1/seo/save" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["page_type", "page_slug"]);
      await seoMetaDB.upsertSeoMeta(env.DB, body);
      return success();
    }

    if (path === "/api/v1/seo/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["page_type", "page_slug"]);
      await seoMetaDB.deleteSeoMeta(env.DB, body.page_type, body.page_slug);
      return success();
    }

  return NOT_HANDLED;
}
