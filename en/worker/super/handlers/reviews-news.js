import * as reviewsDB from "../../database/reviews.js";
import * as newsDB from "../../database/news.js";
import { created, fail, ok, readJsonBody, validateRequired } from "./helpers.js";
import { listAllReviews } from "./casinos.js";

// =====================================================
// REVIEWS
// =====================================================

export async function handleListReviews(request, env) {
  const rows = await listAllReviews(env.DB);
  return ok({ data: rows });
}

export async function handleGetReview(request, env, slug) {
  const row = await reviewsDB.getReview(env.DB, slug);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateReview(request, env, _slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["slug", "title", "content", "casino_slug"]);
    const id = await reviewsDB.createReview(env.DB, body);
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateReview(request, env, slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    validateRequired(body, ["title", "content"]);
    await reviewsDB.updateReview(env.DB, slug, body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDeleteReview(request, env, slug) {
  await reviewsDB.deleteReview(env.DB, slug);
  return ok();
}

// =====================================================
// NEWS
// =====================================================

export async function handleListNews(request, env) {
  const rows = await newsDB.getAllNewsAdmin(env.DB);
  return ok({ data: rows });
}

export async function handleGetNews(request, env, slug) {
  const row = await newsDB.getNews(env.DB, slug);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleCreateNews(request, env, _slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    const id = await newsDB.createNews(env.DB, body);
    return created({ data: { id } });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUpdateNews(request, env, slug, bodyText) {
  const body = await readJsonBody(request, bodyText);
  try {
    await newsDB.updateNews(env.DB, slug, body);
    return ok();
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleDeleteNews(request, env, slug) {
  await newsDB.deleteNews(env.DB, slug);
  return ok();
}
