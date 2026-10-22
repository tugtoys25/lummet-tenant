// SEO landing pages.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as casinos from "../../database/casinos.js";
import * as seoPages from "../../database/seo-pages.js";
import * as itemAccess from "../../database/item-access.js";
import { invalidateNav } from "../../cache.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

/* =========================================================
SEO LANDING PAGES ADMIN API (country_custom / category_country)
========================================================= */
if (path === "/api/v1/seo-pages/list" && request.method === "GET") {return listSeoPagesEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/get" && request.method === "GET") {return getSeoPageEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/create" && request.method === "POST") {return createSeoPageEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/update" && request.method === "POST") {return updateSeoPageEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/delete" && request.method === "POST") {return deleteSeoPageEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/countries-search" && request.method === "GET") {return searchCountriesEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/eligible-casinos" && request.method === "GET") {return eligibleCasinosEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/discover" && request.method === "GET") {return discoverCategoryCountryEndpoint(request, env, user);}
if (path === "/api/v1/seo-pages/generate-draft" && request.method === "POST") {return generateCategoryCountryDraftEndpoint(request, env, user);}

  return NOT_HANDLED;
}

/* =========================================================
SEO LANDING PAGES FUNCTIONS (country_custom / category_country)
========================================================= */

async function listSeoPagesEndpoint(request, env, user) {
  const urlObj = new URL(request.url);
  const pageType = urlObj.searchParams.get("page_type") || null;

  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'seo_pages', 'read', 'sp'
  );
  const whereParts = [];
  const bindParams = [];
  if (condition) { whereParts.push(condition); bindParams.push(...params); }
  if (pageType) { whereParts.push("sp.page_type = ?"); bindParams.push(pageType); }
  const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  const result = await env.DB.prepare(
    `SELECT sp.*, a.name AS author_name
     FROM seo_pages sp
     LEFT JOIN authors a ON sp.author_id = a.id
     ${whereClause}
     ORDER BY sp.updated_at DESC`
  ).bind(...bindParams).all();

  return json({ success: true, pages: result.results || [] });
}

async function getSeoPageEndpoint(request, env, user) {
  const urlObj = new URL(request.url);
  const id = urlObj.searchParams.get("id");
  if (!id) return failure("id is required", 422);

  const page = await itemAccess.getItemById(env.DB, 'seo_pages', id);
  if (!page) return failure("SEO page not found.", 404);

  const canRead = await itemAccess.canAccessItem(env.DB, user, 'seo_pages', 'read', page);
  if (!canRead) return failure("SEO page not found.", 404);

  page.casino_selections = await seoPages.getSeoPageCasinos(env.DB, page.id);
  return json({ success: true, page });
}

async function createSeoPageEndpoint(request, env, user) {
  const body = await request.json();
  validate(body, ["page_type", "slug", "country_code", "title"]);
  body.created_by = user.user_id;
  body.updated_by = user.user_id;

  try {
    const id = await seoPages.createSeoPage(env.DB, body);
    if (Array.isArray(body.casino_selections)) {
      await seoPages.setSeoPageCasinos(env.DB, id, body.casino_selections);
    }
    await invalidateNav(env);
    return success({ id });
  } catch (error) {
    return failure(error.message || "Could not create SEO page.", 422);
  }
}

async function updateSeoPageEndpoint(request, env, user) {
  const body = await request.json();
  validate(body, ["id", "title"]);

  const existing = await itemAccess.getItemById(env.DB, 'seo_pages', body.id);
  if (!existing) return failure("SEO page not found.", 404);

  const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'seo_pages', 'update', existing);
  if (!canUpdate) return failure("SEO page not found.", 404);

  try {
    body.updated_by = user.user_id;
    await seoPages.updateSeoPage(env.DB, body.id, body);
    if (Array.isArray(body.casino_selections)) {
      await seoPages.setSeoPageCasinos(env.DB, body.id, body.casino_selections);
    }
    await invalidateNav(env);
    return success();
  } catch (error) {
    return failure(error.message || "Could not update SEO page.", 422);
  }
}

async function deleteSeoPageEndpoint(request, env, user) {
  const body = await request.json();
  validate(body, ["id"]);

  const existing = await itemAccess.getItemById(env.DB, 'seo_pages', body.id);
  if (!existing) return failure("SEO page not found.", 404);

  const canDelete = await itemAccess.canAccessItem(env.DB, user, 'seo_pages', 'delete', existing);
  if (!canDelete) return failure("SEO page not found.", 404);

  await seoPages.deleteSeoPage(env.DB, body.id);
  await invalidateNav(env);
  return success();
}

async function searchCountriesEndpoint(request, env, user) {
  const urlObj = new URL(request.url);
  const q = urlObj.searchParams.get("q") || "";
  if (!q.trim()) return json({ success: true, countries: [] });
  const rows = await seoPages.searchCountries(env.DB, q);
  return json({ success: true, countries: rows });
}

async function eligibleCasinosEndpoint(request, env, user) {
  const urlObj = new URL(request.url);
  const countryCode = urlObj.searchParams.get("country_code");
  const categorySlug = urlObj.searchParams.get("category_slug");
  if (!countryCode) return failure("country_code is required", 422);

  const rows = categorySlug
    ? await seoPages.getEligibleCasinosForCategoryCountry(env.DB, categorySlug, countryCode)
    : await casinos.getCasinosByCountryAllowlist(env.DB, countryCode);
  return json({ success: true, casinos: rows });
}

async function discoverCategoryCountryEndpoint(request, env, user) {
  const urlObj = new URL(request.url);
  const min = Number(urlObj.searchParams.get("min")) || 1;

  const [combos, existingPages] = await Promise.all([
    seoPages.discoverEligibleCategoryCountryCombos(env.DB, min),
    seoPages.getAllSeoPages(env.DB, { pageType: "category_country" })
  ]);

  const pageByKey = {};
  for (const p of existingPages) pageByKey[`${p.category_id}::${p.country_code}`] = p;

  const combosWithStatus = combos.map((c) => {
    const existing = pageByKey[`${c.category_id}::${c.country_code}`];
    return {
      ...c,
      seo_page_id: existing?.id || null,
      status: existing ? existing.status : "eligible",
      published: existing ? !!existing.published : false
    };
  });

  return json({ success: true, combos: combosWithStatus });
}

async function generateCategoryCountryDraftEndpoint(request, env, user) {
  const body = await request.json();
  validate(body, ["category_id", "category_slug", "category_name", "country_code", "country_name"]);

  try {
    const id = await seoPages.createSeoPage(env.DB, {
      page_type: "category_country",
      slug: body.category_slug,
      country_code: body.country_code,
      category_id: Number(body.category_id),
      title: `${body.category_name} Casinos in ${body.country_name}`,
      casino_mode: "auto_priority",
      status: "draft",
      published: false,
      sitemap_enabled: true,
      auto_generated: true,
      content_json: {},
      created_by: user.user_id,
      updated_by: user.user_id
    });
    return success({ id });
  } catch (error) {
    return failure(error.message || "Could not generate draft.", 422);
  }
}
