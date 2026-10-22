// Generic reviews.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import { logAudit } from "../../database/audit.js";
import * as contentItemsDB from "../../database/content-items.js";
import * as genericReviewsDB from "../../database/generic-reviews.js";
import { cleanSections, describeBlock } from "../../generic-review-sections.js";
import * as itemAccess from "../../database/item-access.js";
import * as reviewBlocksDB from "../../database/review_blocks.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

if (path === "/api/v1/generic-review/create" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["reviewed_content_type", "reviewed_content_id", "slug", "title", "content"]);
  if (!["sportsbook", "affiliate_partner", "custom"].includes(body.reviewed_content_type)) {
    return failure("reviewed_content_type must be sportsbook, affiliate_partner, or custom");
  }
  if (!/^[a-z0-9-]{1,120}$/.test(String(body.slug))) return failure("Slug can only use lowercase letters, numbers and dashes.");
  if (!String(body.content || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() && !/<(img|iframe|video|table)\b/i.test(String(body.content || ""))) return failure("Write the review text first.");
  let newSections = null;
  if (body.sections !== undefined) {
    const cleaned = cleanSections(body.sections);
    if (cleaned.error) return failure(cleaned.error);
    newSections = cleaned.sections;
  }
  const slugTaken = await env.DB.prepare("SELECT id FROM reviews WHERE slug = ? LIMIT 1").bind(body.slug).first();
  if (slugTaken) return failure("A review with this slug already exists -- choose another one.");
  const reviewedItem = await contentItemsDB.getContentItemById(env.DB, body.reviewed_content_type, body.reviewed_content_id);
  if (!reviewedItem) return failure("The item you're reviewing was not found -- check reviewed_content_id", 404);
  const review = await genericReviewsDB.createGenericReview(env.DB, {
    reviewedContentType: body.reviewed_content_type, reviewedContentId: body.reviewed_content_id,
    slug: body.slug, title: body.title, content: body.content,
    pros: body.pros || null, cons: body.cons || null,
    rating: body.rating !== undefined ? parseFloat(body.rating) || null : null,
    verdict: body.verdict || null,
    seoTitle: body.seo_title || null, seoDescription: body.seo_description || null, seoKeywords: body.seo_keywords || null,
    authorId: body.author_id || null, createdBy: user.user_id, published: !!body.published,
  });
  if (newSections && newSections.length) await reviewBlocksDB.syncReviewBlocks(env.DB, review.slug, newSections);
  await logAudit(env.DB, { userId: user.user_id, action: "create", entityType: "review", entityId: review.id, metadata: { reviewed_content_type: body.reviewed_content_type, slug: body.slug } });
  return success({ review });
}

if (path === "/api/v1/generic-reviews/list" && request.method === "GET") {
  const url = new URL(request.url);
  const reviewedContentType = url.searchParams.get("reviewed_content_type");
  if (!reviewedContentType) return failure("reviewed_content_type is required");
  const page = url.searchParams.has("page") ? Math.max(1, parseInt(url.searchParams.get("page")) || 1) : null;
  const perPage = Math.min(200, Math.max(1, parseInt(url.searchParams.get("per_page")) || 25));
  if (page == null) {
    const reviews = await genericReviewsDB.getGenericReviewsForType(env.DB, reviewedContentType);
    return json({ success: true, reviews });
  }
  const result = await genericReviewsDB.getGenericReviewsForType(env.DB, reviewedContentType, { limit: perPage, offset: (page - 1) * perPage, search: (url.searchParams.get("search") || "").trim().slice(0, 80) || null });
  return json({ success: true, reviews: result.items, total: result.total, page, per_page: perPage });
}

if (path === "/api/v1/generic-review/update" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["id"]);
  const fields = {};
  for (const key of ["title", "content", "pros", "cons", "verdict", "seo_title", "seo_description", "seo_keywords"]) {
    if (body[key] !== undefined) fields[key] = body[key];
  }
  if (body.rating !== undefined) fields.rating = parseFloat(body.rating) || null;
  if (body.published !== undefined) fields.published = body.published ? 1 : 0;
  if (body.author_id !== undefined) fields.author_id = body.author_id || null;
  const existingReview = await genericReviewsDB.getGenericReview(env.DB, body.id);
  if (!existingReview) return failure("Review not found or no fields to update", 404); // also what a casino review id gets here
  if (!(await itemAccess.canAccessItem(env.DB, user, "reviews", "update", existingReview))) return failure("Review not found or no fields to update", 404);
  let updSections = null;
  if (body.sections !== undefined) {
    const cleaned = cleanSections(body.sections);
    if (cleaned.error) return failure(cleaned.error);
    updSections = cleaned.sections;
  }
  const review = Object.keys(fields).length
    ? await genericReviewsDB.updateGenericReview(env.DB, body.id, fields)
    : existingReview;
  if (!review) return failure("Review not found or no fields to update", 404);
  if (updSections) await reviewBlocksDB.syncReviewBlocks(env.DB, review.slug, updSections);
  await logAudit(env.DB, { userId: user.user_id, action: "update", entityType: "review", entityId: review.id, metadata: updSections ? { sections: updSections.length } : {} });
  return success({ review });
}

if (path === "/api/v1/generic-review/get" && request.method === "GET") {
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get("id"));
  if (!Number.isInteger(id)) return failure("id is required");
  const review = await genericReviewsDB.getGenericReview(env.DB, id); // generic-only: a casino review id is a 404 here
  if (!review) return failure("Review not found", 404);
  if (!(await itemAccess.canAccessItem(env.DB, user, "reviews", "read", review))) return failure("Review not found", 404);
  const sections = await reviewBlocksDB.getReviewBlocks(env.DB, review.slug);
  return json({ success: true, review, sections: sections.map(describeBlock) });
}

if (path === "/api/v1/generic-review/delete" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["id"]);
  const existingReview = await genericReviewsDB.getGenericReview(env.DB, body.id); // generic-only: a casino review id is a 404 here
  if (!existingReview) return failure("Review not found", 404);
  if (!(await itemAccess.canAccessItem(env.DB, user, "reviews", "delete", existingReview))) return failure("Review not found", 404);
  await genericReviewsDB.deleteGenericReview(env.DB, body.id);
  await logAudit(env.DB, { userId: user.user_id, action: "delete", entityType: "review", entityId: existingReview.id, metadata: { reviewed_content_type: existingReview.reviewed_content_type, slug: existingReview.slug } });
  return success();
}

  return NOT_HANDLED;
}
