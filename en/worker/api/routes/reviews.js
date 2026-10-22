// Reviews and review blocks.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as reviews from "../../database/reviews.js";
import { cleanSections, describeBlock } from "../../generic-review-sections.js";
import { REVIEW_PARTS, getHiddenParts, setHiddenParts, clearHiddenParts } from "../../review-visibility.js";
import * as itemAccess from "../../database/item-access.js";
import { notifyOnPublish } from "../../content-notifications.js";
import * as reviewBlocksDB from "../../database/review_blocks.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

// ==================================
// READ ENDPOINTS (add to api.js route handler)
// ==================================

// List reviews
if (path === "/api/v1/reviews/list") {
  const { condition, params } = await itemAccess.getAccessibleWhereClause(
    env.DB, user, 'reviews', 'read', ''
  );
  const whereParts = ['published = 1', "(reviewed_content_type IS NULL OR reviewed_content_type = 'casino')"];
  if (condition) whereParts.push(condition);
  const whereClause = 'WHERE ' + whereParts.join(' AND ');

  const result = await env.DB.prepare(
    `SELECT * FROM reviews ${whereClause} ORDER BY created_at DESC`
  ).bind(...params).all();
  return json({ reviews: result.results });
}

    // ==================================
    // REVIEWS
    // ==================================

    if (
      path === "/api/v1/review/create" &&
      request.method === "POST"
    ) {
      return createReview(request, env, user);
    }

    if (
      path === "/api/v1/review/update" &&
      request.method === "POST"
    ) {
      return updateReview(request, env, user);
    }

    // ==================================
    // REVIEW DELETE + PAGE DELETE
    // ==================================

    if (path === "/api/v1/review/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug"]);

      const existing = await itemAccess.getItemBySlug(env.DB, 'reviews', body.slug);
      if (!existing) return failure("Review not found", 404);
      const canDelete = await itemAccess.canAccessItem(env.DB, user, 'reviews', 'delete', existing);
      if (!canDelete) return failure("Review not found", 404);

      const { deleteReview } = await import("../../database/reviews.js");
      await deleteReview(env.DB, body.slug);
      await clearHiddenParts(env.DB, body.slug);
      return success();
    }

    // ==================================
    // REVIEW BLOCKS CRUD
    // ==================================

    if (path === "/api/v1/review-blocks/list" && request.method === "GET") {
      const url = new URL(request.url);
      const reviewSlug = url.searchParams.get("review_slug");
      if (!reviewSlug) return failure("review_slug is required");
      const blocks = await reviewBlocksDB.getReviewBlocks(env.DB, reviewSlug);
      return json({ blocks, sections: blocks.map(describeBlock), parts: REVIEW_PARTS, hidden_parts: [...(await getHiddenParts(env.DB, reviewSlug))] });
    }

    if (path === "/api/v1/review-blocks/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["review_slug", "title", "content"]);
      const id = await reviewBlocksDB.createReviewBlock(env.DB, body);
      return json({ success: true, id });
    }

    if (path === "/api/v1/review-blocks/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "title", "content"]);
      await reviewBlocksDB.updateReviewBlock(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/review-blocks/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await reviewBlocksDB.deleteReviewBlock(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/review-blocks/sync" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["review_slug"]);
      if (body.hidden_parts !== undefined) await setHiddenParts(env.DB, body.review_slug, body.hidden_parts);
      if (body.blocks === undefined && body.sections === undefined) return success();
      let toSave = body.blocks;
      if (body.sections !== undefined) {
        const cleaned = cleanSections(body.sections);
        if (cleaned.error) return failure(cleaned.error);
        toSave = cleaned.sections;
      }
      if (!Array.isArray(toSave)) return failure("blocks or sections is required");
      await reviewBlocksDB.syncReviewBlocks(env.DB, body.review_slug, toSave);
      return success();
    }

  return NOT_HANDLED;
}

// =====================================================
// REVIEWS
// =====================================================

async function createReview(request, env, user) {
  const body = await request.json();
  validate(body, ["slug", "title", "content", "casino_slug"]);
  body.created_by = user.user_id;
  await reviews.createReview(
    env.DB,
    body
  );

  if (body.published !== 0) {
    await notifyOnPublish(env, request, { type: 'review', title: body.title, slug: body.slug });
  }

  return success();
}

async function updateReview(request, env, user) {
  const body = await request.json();
  validate(body, ["slug", "title", "content"]);

  // Item-level access check
  const existing = await itemAccess.getItemBySlug(env.DB, 'reviews', body.slug);
  if (!existing) return failure("Review not found", 404);
  const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'reviews', 'update', existing);
  if (!canUpdate) return failure("Review not found", 404);

  await reviews.updateReview(
    env.DB,
    body.slug,
    body
  );

  return success();
}
