import * as casinosDB from "../../database/casinos.js";
import * as geoDB from "../../database/geo.js";
import * as paymentMethodsDB from "../../database/payment-methods.js";
import { created, fail, ok, readJsonBody, validateRequired } from "./helpers.js";

// =====================================================
// GENERIC LIST HELPERS FOR RESOURCES WITHOUT AN
// EXISTING "list all" EXPORT (read-only, fixed query —
// not arbitrary SQL; see rule #25).
// =====================================================

export async function listAllReviews(db) {
  const result = await db
    .prepare(`SELECT * FROM reviews ORDER BY created_at DESC`)
    .all();
  return result.results || [];
}

// =====================================================
// CASINOS
// =====================================================

export async function handleListCasinos(request, env) {
  const rows = await casinosDB.getAllCasinosAdmin(env.DB);
  return ok({ data: rows });
}

export async function handleGetCasino(request, env, slug) {
  const row = await casinosDB.getCasinoAdmin(env.DB, slug);
  if (!row) return fail("not_found", 404);

  // Enrich with the casino's category assignments (casino_categories
  // join table), payment method assignments (casino_payment_methods
  // join table), and per-country geo rules (geo_rules table) — these
  // aren't columns on `casinos` itself, but the control plane's form
  // needs them alongside the record to let admins choose categories,
  // payment methods, and countries, matching what the tenant's own
  // /api/v1/casino/get and /api/v1/geo/list already expose.
  row.category_ids = await casinosDB.getCasinoCategories(env.DB, row.id);
  row.geo_rules = await geoDB.getGeoRulesForCasino(env.DB, row.slug);
  row.payment_method_ids = await paymentMethodsDB.getPaymentMethodIdsForCasino(env.DB, row.id);

  return ok({ data: row });
}

export async function handleCreateCasino(request, env, _slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["slug", "name", "affiliate_url"]);
    const id = await casinosDB.createCasino(env.DB, body);
    if (Array.isArray(body.category_ids)) {
      await casinosDB.setCasinoCategories(env.DB, id, body.category_ids);
    }
    if (Array.isArray(body.payment_method_ids)) {
      await paymentMethodsDB.setCasinoPaymentMethods(env.DB, id, body.payment_method_ids);
    }
    if (Array.isArray(body.geo_rules)) {
      await geoDB.setCasinoGeoRules(env.DB, body.slug, body.geo_rules);
    }
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateCasino(request, env, slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    // slug/name/affiliate_url required on update too, matching
    // api.js's updateCasino. Note: casinos CAN be renamed — `slug`
    // (URL path segment) is the identity used to find the row,
    // but body.slug (if different) becomes the new slug, exactly
    // like the tenant's own admin (which calls this old_slug vs
    // slug). Whatever value the caller sends in body.slug wins.
    validateRequired(body, ["name", "affiliate_url"]);
    await casinosDB.updateCasino(env.DB, slug, body);

    const newSlug = body.slug || slug;
    const casinoId = await casinosDB.getCasinoIdBySlug(env.DB, newSlug);

    if (casinoId && Array.isArray(body.category_ids)) {
      await casinosDB.setCasinoCategories(env.DB, casinoId, body.category_ids);
    }
    if (casinoId && Array.isArray(body.payment_method_ids)) {
      await paymentMethodsDB.setCasinoPaymentMethods(env.DB, casinoId, body.payment_method_ids);
    }
    if (Array.isArray(body.geo_rules)) {
      // Geo rules are keyed by casino_slug, not id — if the slug
      // changed, the old rows are orphaned under the old slug and
      // must be cleared out before writing the new set.
      if (newSlug !== slug) {
        await geoDB.deleteGeoRulesForCasino(env.DB, slug);
      }
      await geoDB.setCasinoGeoRules(env.DB, newSlug, body.geo_rules);
    }

    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDeleteCasino(request, env, slug) {
  try {
    await casinosDB.deleteCasino(env.DB, slug);
    return ok();
  } catch (error) {
    if (/FOREIGN KEY/i.test(String(error && error.message))) {
      return fail("Cannot delete: this casino still has offers, tracking links or commercial terms attached. Unpublish it instead, or remove those first.", 409);
    }
    throw error;
  }
}
