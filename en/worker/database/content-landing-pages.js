// worker/database/content-landing-pages.js
//
// Generic-content counterpart to the casino-only SEO landing page
// system (seo_pages, migration 0019 -- country x category matrix,
// casino_grid/casino_editorial/casino_spotlights sections, casino_mode
// builder). That system is left completely untouched; this is a
// smaller, separate one for sportsbook/affiliate_partner/custom
// (migration 0061): one item grid per page, manual or auto selection,
// no section builder.

export async function getAllLandingPages(db, { contentType = null } = {}) {
  const clauses = [];
  const params = [];
  if (contentType) { clauses.push("content_type = ?"); params.push(contentType); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await db.prepare(`SELECT * FROM content_landing_pages ${where} ORDER BY updated_at DESC`).bind(...params).all();
  return result.results || [];
}

export async function getLandingPage(db, slug) {
  return db.prepare(`SELECT * FROM content_landing_pages WHERE slug = ? LIMIT 1`).bind(slug).first();
}

/** Public-gated lookup, same status-only gate comparisons.getPublishedComparison() uses (this table has no separate "published" boolean either). */
export async function getPublishedLandingPage(db, slug) {
  return db.prepare(`SELECT * FROM content_landing_pages WHERE slug = ? AND status = 'published' LIMIT 1`).bind(slug).first();
}

export async function getLandingPageById(db, id) {
  return db.prepare(`SELECT * FROM content_landing_pages WHERE id = ? LIMIT 1`).bind(id).first();
}

export async function getLandingPageItemIds(db, landingPageId) {
  const result = await db.prepare(`SELECT content_id FROM content_landing_page_items WHERE landing_page_id = ? ORDER BY position ASC`).bind(landingPageId).all();
  return (result.results || []).map(r => r.content_id);
}

export async function setLandingPageItems(db, landingPageId, contentIds) {
  await db.prepare(`DELETE FROM content_landing_page_items WHERE landing_page_id = ?`).bind(landingPageId).run();
  for (let i = 0; i < contentIds.length; i++) {
    await db.prepare(`INSERT OR IGNORE INTO content_landing_page_items (landing_page_id, content_id, position) VALUES (?, ?, ?)`).bind(landingPageId, contentIds[i], i).run();
  }
}

export async function createLandingPage(db, fields) {
  const {
    contentType, customTypeSlug = null, slug, title, description = null,
    itemMode = "manual", autoLimit = 10, status = "draft",
    seoTitle = null, seoDescription = null, seoKeywords = null,
    authorId = null, createdBy = null,
  } = fields;
  return db.prepare(`
    INSERT INTO content_landing_pages (
      content_type, custom_type_slug, slug, title, description, item_mode, auto_limit, status,
      seo_title, seo_description, seo_keywords, author_id, created_by, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).bind(
    contentType, customTypeSlug, slug, title, description, itemMode, autoLimit, status,
    seoTitle, seoDescription, seoKeywords, authorId, createdBy,
    status === "published" ? new Date().toISOString() : null
  ).first();
}

export async function updateLandingPage(db, slug, fields) {
  const existing = await getLandingPage(db, slug);
  if (!existing) return null;
  const columnMap = {
    title: "title", description: "description", itemMode: "item_mode", autoLimit: "auto_limit",
    status: "status", seoTitle: "seo_title", seoDescription: "seo_description", seoKeywords: "seo_keywords",
  };
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(columnMap)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) { sets.push(`${column} = ?`); values.push(fields[key]); }
  }
  if (!sets.length) return existing;
  sets.push("updated_at = CURRENT_TIMESTAMP");
  if (fields.status === "published" && existing.status !== "published") sets.push("published_at = CURRENT_TIMESTAMP");
  values.push(existing.id);
  return db.prepare(`UPDATE content_landing_pages SET ${sets.join(", ")} WHERE id = ? RETURNING *`).bind(...values).first();
}

export async function deleteLandingPage(db, slug) {
  const existing = await getLandingPage(db, slug);
  if (!existing) return null;
  // content_landing_page_items has ON DELETE CASCADE (migration 0061),
  // but deleted explicitly anyway -- same "don't rely on the test
  // shim/every SQLite config enforcing FKs" reasoning as
  // comparisons.deleteComparison().
  await db.prepare(`DELETE FROM content_landing_page_items WHERE landing_page_id = ?`).bind(existing.id).run();
  await db.prepare(`DELETE FROM content_landing_pages WHERE id = ?`).bind(existing.id).run();
  return existing;
}
