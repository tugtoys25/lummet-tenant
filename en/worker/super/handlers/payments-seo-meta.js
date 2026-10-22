import * as paymentMethodsDB from "../../database/payment-methods.js";
import * as seoMetaDB from "../../database/seo_meta.js";
import { created, fail, ok, readJsonBody } from "./helpers.js";

// =====================================================
// PAYMENT METHODS (slug-keyed, same shape as categories above)
//
// Added for the control plane's payment-methods CRUD screen. Never
// exposed through this API before now -- en/worker/database/
// payment-methods.js's own comment ("ready for a future dashboard
// screen") flagged this as the intended next step. Mirrors
// handleCreateCategory/handleUpdateCategory/handleDeleteCategory
// above exactly: same slug-keyed shape, same thin-wrapper convention.
//
// The casino_payment_methods join (which casinos accept a given
// method) is deliberately NOT exposed here -- that's a many-to-many
// assignment UI of its own (mirroring casino<->category assignment,
// which the control plane also doesn't expose), out of scope for
// "manage the payment method records themselves".
// =====================================================

export async function handleListPaymentMethods(request, env) {
  const rows = await paymentMethodsDB.getAllPaymentMethods(env.DB);
  return ok({ data: rows });
}

export async function handleGetPaymentMethod(request, env, slug) {
  const row = await paymentMethodsDB.getPaymentMethod(env.DB, slug);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreatePaymentMethod(request, env, _slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.slug || !body.name) return fail("slug and name are required");
  await paymentMethodsDB.createPaymentMethod(env.DB, body);
  return created({ data: { slug: body.slug } });
}

export async function handleUpdatePaymentMethod(request, env, slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await paymentMethodsDB.updatePaymentMethod(env.DB, slug, body);
  return ok();
}

export async function handleDeletePaymentMethod(request, env, slug) {
  await paymentMethodsDB.deletePaymentMethod(env.DB, slug);
  return ok();
}

// =====================================================
// SEO META (composite-keyed by page_type + page_slug, not a single
// id/slug -- mirrors en/worker/api.js's /api/v1/seo/* routes exactly,
// including upsert-on-save semantics from seo_meta.js's
// upsertSeoMeta(). Read and write both take page_type/page_slug as
// query params or body fields; there's no numeric id at all.
// =====================================================

export async function handleListSeoMeta(request, env) {
  const rows = await seoMetaDB.getAllSeoMeta(env.DB);
  return ok({ data: rows });
}

export async function handleGetSeoMeta(request, env) {
  const url = new URL(request.url);
  const pageType = url.searchParams.get("page_type");
  const pageSlug = url.searchParams.get("page_slug");
  if (!pageType || !pageSlug) return fail("page_type and page_slug are required");
  const row = await seoMetaDB.getSeoMeta(env.DB, pageType, pageSlug);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleSaveSeoMeta(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.page_type || !body.page_slug) return fail("page_type and page_slug are required");
  await seoMetaDB.upsertSeoMeta(env.DB, body);
  return ok();
}

export async function handleDeleteSeoMeta(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.page_type || !body.page_slug) return fail("page_type and page_slug are required");
  await seoMetaDB.deleteSeoMeta(env.DB, body.page_type, body.page_slug);
  return ok();
}
