// =====================================================
// SEO META DATABASE MODULE
// =====================================================

export async function getSeoMeta(db, pageType, pageSlug) {
  return await db.prepare(`
    SELECT * FROM seo_meta
    WHERE page_type = ? AND page_slug = ?
    LIMIT 1
  `).bind(pageType, pageSlug).first();
}

export async function upsertSeoMeta(db, data) {
  return await db.prepare(`
    INSERT INTO seo_meta (page_type, page_slug, title, description, keywords, canonical, og_image, schema_json, robots)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(page_type, page_slug) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      keywords = excluded.keywords,
      canonical = excluded.canonical,
      og_image = excluded.og_image,
      schema_json = excluded.schema_json,
      robots = excluded.robots,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    data.page_type,
    data.page_slug,
    data.title || null,
    data.description || null,
    data.keywords || null,
    data.canonical || null,
    data.og_image || null,
    data.schema_json || null,
    data.robots || "index, follow"
  ).run();
}

export async function deleteSeoMeta(db, pageType, pageSlug) {
  return await db.prepare(`
    DELETE FROM seo_meta WHERE page_type = ? AND page_slug = ?
  `).bind(pageType, pageSlug).run();
}

export async function getAllSeoMeta(db) {
  const result = await db.prepare(`
    SELECT * FROM seo_meta ORDER BY updated_at DESC
  `).all();
  return result.results || [];
}
