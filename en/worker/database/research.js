// =====================================================
// RESEARCH ENGINE — Phase 1 database layer
// Plain async CRUD over research_items, same shape/conventions
// as database/countries.js and database/pages.js. No ORM.
// =====================================================

const RESEARCH_TYPES = [
  "report", "country", "regulator", "topic",
  "development", "legislation", "licence"
];

export function isValidResearchType(type) {
  return RESEARCH_TYPES.includes(type);
}

export async function getResearchItem(db, type, slug) {
  return await db
    .prepare(`
      SELECT
        r.*,
        c.name AS country_name,
        a.name AS author_name,
        a.slug AS author_slug,
        m.url AS og_image_url,
        m.alt_text AS og_image_alt
      FROM research_items r
      LEFT JOIN countries c ON c.code = r.country_id
      LEFT JOIN authors a ON a.id = r.author_id
      LEFT JOIN media_library m ON m.id = r.og_image
      WHERE r.type = ? AND r.slug = ?
      LIMIT 1
    `)
    .bind(type, slug)
    .first();
}

export async function getResearchItemById(db, id) {
  return await db.prepare(`SELECT * FROM research_items WHERE id = ? LIMIT 1`).bind(id).first();
}

export async function getAllResearchItems(db) {
  const result = await db.prepare(`
    SELECT r.*, c.name AS country_name
    FROM research_items r
    LEFT JOIN countries c ON c.code = r.country_id
    ORDER BY r.updated_at DESC
  `).all();
  return result.results || [];
}

/**
 * Published, non-draft research items — used by public list/hub
 * pages and the sitemap. Same published/status gate as
 * getPublishedCountries().
 */
export async function getPublishedResearchItems(db, { type = null, limit = 50000 } = {}) {
  if (type) {
    const result = await db.prepare(`
      SELECT r.*, c.name AS country_name
      FROM research_items r
      LEFT JOIN countries c ON c.code = r.country_id
      WHERE r.type = ? AND r.published = 1 AND r.status != 'draft'
      ORDER BY r.published_at DESC, r.updated_at DESC
      LIMIT ?
    `).bind(type, limit).all();
    return result.results || [];
  }

  const result = await db.prepare(`
    SELECT r.*, c.name AS country_name
    FROM research_items r
    LEFT JOIN countries c ON c.code = r.country_id
    WHERE r.published = 1 AND r.status != 'draft'
    ORDER BY r.published_at DESC, r.updated_at DESC
    LIMIT ?
  `).bind(limit).all();
  return result.results || [];
}

export async function getFeaturedResearchItems(db, limit = 6) {
  const result = await db.prepare(`
    SELECT r.*, c.name AS country_name
    FROM research_items r
    LEFT JOIN countries c ON c.code = r.country_id
    WHERE r.featured = 1 AND r.published = 1 AND r.status != 'draft'
    ORDER BY r.published_at DESC
    LIMIT ?
  `).bind(limit).all();
  return result.results || [];
}

/**
 * Research items whose next_review_at has passed — feeds the
 * review-queue dashboard added in a later phase; exposed here
 * now so the overview cards in Phase 1's admin list can show a
 * count.
 */
export async function getOverdueResearchItems(db) {
  const result = await db.prepare(`
    SELECT id, type, slug, title, next_review_at
    FROM research_items
    WHERE published = 1 AND next_review_at IS NOT NULL AND next_review_at < CURRENT_TIMESTAMP
    ORDER BY next_review_at ASC
  `).all();
  return result.results || [];
}

export async function createResearchItem(db, data) {
  if (!isValidResearchType(data.type)) {
    throw new Error(`Invalid research type: ${data.type}`);
  }
  const result = await db.prepare(`
    INSERT INTO research_items (
      type, slug, title, subtitle, excerpt, content_json,
      country_id, author_id, status, published, robots,
      seo_title, seo_description, seo_keywords, canonical_url, og_image,
      featured, published_at, last_verified_at, next_review_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  .bind(
    data.type,
    data.slug,
    data.title,
    data.subtitle || null,
    data.excerpt || null,
    typeof data.content_json === "string" ? data.content_json : JSON.stringify(data.content_json || {}),
    data.country_id || null,
    data.author_id ? Number(data.author_id) : null,
    data.status || "draft",
    data.published !== undefined ? (data.published ? 1 : 0) : 0,
    data.robots || "index,follow",
    data.seo_title || null,
    data.seo_description || null,
    data.seo_keywords || null,
    data.canonical_url || null,
    data.og_image ? Number(data.og_image) : null,
    data.featured ? 1 : 0,
    data.published && !data.published_at ? new Date().toISOString() : (data.published_at || null),
    data.last_verified_at || null,
    data.next_review_at || null
  )
  .run();

  return result;
}

export async function updateResearchItem(db, id, data) {
  if (data.type && !isValidResearchType(data.type)) {
    throw new Error(`Invalid research type: ${data.type}`);
  }

  // Publishing for the first time stamps published_at, same
  // pattern as offers.js's status-transition timestamps — never
  // overwrites an existing published_at on a re-save.
  let publishedAt = data.published_at || null;
  if (data.published && !publishedAt) {
    const existing = await getResearchItemById(db, id);
    publishedAt = existing?.published_at || new Date().toISOString();
  }

  const result = await db.prepare(`
    UPDATE research_items SET
      type=?, slug=?, title=?, subtitle=?, excerpt=?, content_json=?,
      country_id=?, author_id=?, status=?, published=?, robots=?,
      seo_title=?, seo_description=?, seo_keywords=?, canonical_url=?, og_image=?,
      featured=?, published_at=?, last_verified_at=?, next_review_at=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `)
  .bind(
    data.type,
    data.slug,
    data.title,
    data.subtitle || null,
    data.excerpt || null,
    typeof data.content_json === "string" ? data.content_json : JSON.stringify(data.content_json || {}),
    data.country_id || null,
    data.author_id ? Number(data.author_id) : null,
    data.status || "draft",
    data.published !== undefined ? (data.published ? 1 : 0) : 0,
    data.robots || "index,follow",
    data.seo_title || null,
    data.seo_description || null,
    data.seo_keywords || null,
    data.canonical_url || null,
    data.og_image ? Number(data.og_image) : null,
    data.featured ? 1 : 0,
    publishedAt,
    data.last_verified_at || null,
    data.next_review_at || null,
    id
  )
  .run();

  return result;
}

export async function deleteResearchItem(db, id) {
  return await db.prepare(`DELETE FROM research_items WHERE id = ?`).bind(id).run();
}

export { RESEARCH_TYPES };
