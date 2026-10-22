import * as reviewBlocksDB from "../../database/review_blocks.js";
import * as adRulesDB from "../../database/ad-rules.js";
import { created, fail, ok, readJsonBody } from "./helpers.js";

// =====================================================
// REVIEW BLOCKS
// Extra ordered title+content sub-sections attached to a review
// (e.g. "Deposit Methods", "Mobile Experience") — wraps
// en/worker/database/review_blocks.js, the same module the
// tenant's own admin already uses at /api/v1/review-blocks/*.
// =====================================================

export async function handleListReviewBlocks(request, env) {
  const url = new URL(request.url);
  const reviewSlug = url.searchParams.get("review_slug");
  if (!reviewSlug) return fail("review_slug_required", 422);
  const rows = await reviewBlocksDB.getReviewBlocks(env.DB, reviewSlug);
  return ok({ data: rows });
}

// POST body: { review_slug, title, content, position? }
export async function handleCreateReviewBlock(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.review_slug || !body.title) {
    return fail("review_slug_and_title_required", 422);
  }
  const id = await reviewBlocksDB.createReviewBlock(env.DB, body);
  return created({ data: { id } });
}

// PUT body: { title, content, position? }
export async function handleUpdateReviewBlock(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.title) return fail("title_required", 422);
  await reviewBlocksDB.updateReviewBlock(env.DB, id, body);
  return ok();
}

export async function handleDeleteReviewBlock(request, env, id) {
  await reviewBlocksDB.deleteReviewBlock(env.DB, id);
  return ok();
}

// =====================================================
// AD RULES
// Automatic ad-placement engine — wraps
// en/worker/database/ad-rules.js (validation lives there already,
// same module the tenant's own /api/v1/ad-rules/* uses).
// =====================================================

export async function handleListAdRules(request, env) {
  const rows = await adRulesDB.getAllAdRules(env.DB);
  return ok({ data: rows });
}

export async function handleCreateAdRule(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    const result = await adRulesDB.createAdRule(env.DB, body);
    return created({ data: { id: result.meta?.last_row_id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateAdRule(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    await adRulesDB.updateAdRule(env.DB, id, body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDeleteAdRule(request, env, id) {
  try {
    await adRulesDB.deleteAdRule(env.DB, id);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}
