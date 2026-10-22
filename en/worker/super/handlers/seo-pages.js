import * as casinosDB from "../../database/casinos.js";
import * as categoriesDB from "../../database/categories.js";
import * as seoPagesDB from "../../database/seo-pages.js";
import { created, fail, ok, readJsonBody } from "./helpers.js";

// =====================================================
// SEO LANDING PAGES (country_custom / category_country)
// Wraps en/worker/database/seo-pages.js. See
// migrations/0019_seo_landing_pages.sql for the schema.
// =====================================================

export async function handleListSeoPages(request, env) {
  const url = new URL(request.url);
  const pageType = url.searchParams.get("page_type") || null;
  const rows = await seoPagesDB.getAllSeoPages(env.DB, { pageType });
  return ok({ data: rows });
}

export async function handleGetSeoPage(request, env, id) {
  const row = await seoPagesDB.getSeoPageById(env.DB, id);
  if (!row) return fail("not_found", 404);
  row.casino_selections = await seoPagesDB.getSeoPageCasinos(env.DB, row.id);
  return ok({ data: row });
}

// POST body: full seo_pages fields + optional casino_selections[]
export async function handleCreateSeoPage(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    const id = await seoPagesDB.createSeoPage(env.DB, body);
    if (Array.isArray(body.casino_selections)) {
      await seoPagesDB.setSeoPageCasinos(env.DB, id, body.casino_selections);
    }
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateSeoPage(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    await seoPagesDB.updateSeoPage(env.DB, id, body);
    if (Array.isArray(body.casino_selections)) {
      await seoPagesDB.setSeoPageCasinos(env.DB, id, body.casino_selections);
    }
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDeleteSeoPage(request, env, id) {
  await seoPagesDB.deleteSeoPage(env.DB, id);
  return ok();
}

// GET ?q=CA or ?q=Canada — country search supporting both code and
// name (spec: "search must support both country code and country name").
export async function handleSearchCountriesForSeoPages(request, env) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  if (!q.trim()) return ok({ data: [] });
  const rows = await seoPagesDB.searchCountries(env.DB, q);
  return ok({ data: rows });
}

// GET ?country_code=CA (country_custom picker) or
//     ?country_code=CA&category_slug=crypto-casinos (category_country picker)
export async function handleGetEligibleCasinosForSeoPage(request, env) {
  const url = new URL(request.url);
  const countryCode = url.searchParams.get("country_code");
  const categorySlug = url.searchParams.get("category_slug");
  if (!countryCode) return fail("country_code_required", 422);

  const rows = categorySlug
    ? await seoPagesDB.getEligibleCasinosForCategoryCountry(env.DB, categorySlug, countryCode)
    : await casinosDB.getCasinosByCountryAllowlist(env.DB, countryCode);
  return ok({ data: rows });
}

// GET ?slug=crypto — every casino already in this category, with
// no country filter at all. Used by the base category hub page's
// own content-section casino pickers (Lummet's /content/categories
// editor), which have no country context, unlike seo-pages'
// category_country combo pages.
export async function handleGetEligibleCasinosForCategory(request, env) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return fail("slug_required", 422);
  const rows = await categoriesDB.getCategoryCasinos(env.DB, slug);
  return ok({ data: rows });
}

// GET ?min=1 — discovers every category x country combination that
// clears the minimum casino count, cross-referenced with any
// existing seo_pages rows so the admin can show eligible / draft /
// published status per combination (spec section 2 + section 9).
export async function handleDiscoverCategoryCountryCombos(request, env) {
  const url = new URL(request.url);
  const min = Number(url.searchParams.get("min")) || 1;

  const [combos, existingPages] = await Promise.all([
    seoPagesDB.discoverEligibleCategoryCountryCombos(env.DB, min),
    seoPagesDB.getAllSeoPages(env.DB, { pageType: "category_country" })
  ]);

  const pageByKey = {};
  for (const p of existingPages) pageByKey[`${p.category_id}::${p.country_code}`] = p;

  const merged = combos.map((c) => {
    const existing = pageByKey[`${c.category_id}::${c.country_code}`];
    return {
      ...c,
      seo_page_id: existing?.id || null,
      status: existing ? existing.status : "eligible",
      published: existing ? !!existing.published : false
    };
  });

  return ok({ data: merged });
}
