// Content landing pages.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import { logAudit } from "../../database/audit.js";
import * as landingPagesDB from "../../database/content-landing-pages.js";
import { cleanSections, describeBlock } from "../../generic-review-sections.js";
import * as reviewBlocksDB from "../../database/review_blocks.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

// =====================================================
// CONTENT LANDING PAGES (audit "SEO landing pages for generic types").
// Deliberately smaller than the casino seo_pages system (migration
// 0019): one item grid per page, manual or auto selection, no
// country x category matrix, no section builder. See migration 0061.
// =====================================================

if (path === "/api/v1/content-landing-pages/list" && request.method === "GET") {
  const url = new URL(request.url);
  const contentType = url.searchParams.get("content_type") || null;
  const pages = await landingPagesDB.getAllLandingPages(env.DB, { contentType });
  return json({ success: true, pages });
}

if (path === "/api/v1/content-landing-page/get" && request.method === "GET") {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return failure("slug is required");
  const page = await landingPagesDB.getLandingPage(env.DB, slug);
  if (!page) return failure("Landing page not found", 404);
  const itemIds = await landingPagesDB.getLandingPageItemIds(env.DB, page.id);
  const blocks = await reviewBlocksDB.getReviewBlocks(env.DB, landingPagesDB.landingBlocksKey(page.slug));
  return json({ success: true, page, item_ids: itemIds, sections: blocks.map(describeBlock) });
}

if (path === "/api/v1/content-landing-page/create" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["content_type", "slug", "title"]);
  if (!["sportsbook", "affiliate_partner", "custom"].includes(body.content_type)) {
    return failure("content_type must be sportsbook, affiliate_partner, or custom");
  }
  if (body.content_type === "custom" && !body.custom_type_slug) {
    return failure("custom_type_slug is required when content_type is custom");
  }
  if (body.item_mode && !["manual", "auto"].includes(body.item_mode)) {
    return failure('item_mode must be "manual" or "auto"');
  }
  if (!/^[a-z0-9-]{1,120}$/.test(String(body.slug))) return failure("Slug can only use lowercase letters, numbers and dashes.");
  if (await landingPagesDB.getLandingPage(env.DB, body.slug)) return failure("A landing page with this slug already exists -- choose another one.");
  let lpSections = null;
  if (body.sections !== undefined) {
    const cleaned = cleanSections(body.sections);
    if (cleaned.error) return failure(cleaned.error);
    lpSections = cleaned.sections;
  }
  const page = await landingPagesDB.createLandingPage(env.DB, {
    contentType: body.content_type, customTypeSlug: body.custom_type_slug || null,
    slug: body.slug, title: body.title, description: body.description || null,
    itemMode: body.item_mode || "manual", autoLimit: parseInt(body.auto_limit) || 10,
    status: body.status || "draft",
    seoTitle: body.seo_title || null, seoDescription: body.seo_description || null, seoKeywords: body.seo_keywords || null,
    authorId: body.author_id || null, createdBy: user.user_id,
  });
  if (page.item_mode === "manual" && Array.isArray(body.item_ids)) {
    await landingPagesDB.setLandingPageItems(env.DB, page.id, body.item_ids.map(Number).filter(Number.isInteger));
  }
  if (lpSections && lpSections.length) await reviewBlocksDB.syncReviewBlocks(env.DB, landingPagesDB.landingBlocksKey(page.slug), lpSections);
  await logAudit(env.DB, { userId: user.user_id, action: "create", entityType: "content_landing_page", entityId: page.id, metadata: { slug: body.slug, content_type: body.content_type } });
  return success({ page });
}

if (path === "/api/v1/content-landing-page/update" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["slug"]);
  const existing = await landingPagesDB.getLandingPage(env.DB, body.slug);
  if (!existing) return failure("Landing page not found", 404);
  if (body.item_mode && !["manual", "auto"].includes(body.item_mode)) {
    return failure('item_mode must be "manual" or "auto"');
  }
  const fields = {};
  for (const [bodyKey, fieldKey] of [["title", "title"], ["description", "description"], ["item_mode", "itemMode"], ["status", "status"], ["seo_title", "seoTitle"], ["seo_description", "seoDescription"], ["seo_keywords", "seoKeywords"]]) {
    if (body[bodyKey] !== undefined) fields[fieldKey] = body[bodyKey];
  }
  if (body.auto_limit !== undefined) fields.autoLimit = parseInt(body.auto_limit) || 10;
  if (body.author_id !== undefined) fields.authorId = body.author_id ? Number(body.author_id) || null : null;
  let lpSections = null;
  if (body.sections !== undefined) {
    const cleaned = cleanSections(body.sections);
    if (cleaned.error) return failure(cleaned.error);
    lpSections = cleaned.sections;
  }
  const page = await landingPagesDB.updateLandingPage(env.DB, body.slug, fields);
  if (lpSections) await reviewBlocksDB.syncReviewBlocks(env.DB, landingPagesDB.landingBlocksKey(page.slug), lpSections);
  if (Array.isArray(body.item_ids)) await landingPagesDB.setLandingPageItems(env.DB, page.id, body.item_ids.map(Number).filter(Number.isInteger));
  await logAudit(env.DB, { userId: user.user_id, action: "update", entityType: "content_landing_page", entityId: page.id, metadata: { slug: body.slug, status: page.status } });
  return success({ page });
}

if (path === "/api/v1/content-landing-page/delete" && request.method === "POST") {
  const body = await request.json();
  validate(body, ["slug"]);
  const existing = await landingPagesDB.deleteLandingPage(env.DB, body.slug);
  if (!existing) return failure("Landing page not found", 404);
  await logAudit(env.DB, { userId: user.user_id, action: "delete", entityType: "content_landing_page", entityId: existing.id, metadata: { slug: body.slug, title: existing.title } });
  return success();
}

  return NOT_HANDLED;
}
