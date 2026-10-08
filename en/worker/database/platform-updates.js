// =====================================================
// PLATFORM UPDATES DATABASE
// =====================================================

export async function getAllPlatformUpdates(db) {
  const result = await db.prepare(`
    SELECT
      pu.*,
      a.name AS author_name,
      a.slug AS author_slug,
      a.avatar_url AS author_avatar,
      a.role AS author_role,
      m.url AS featured_image_url,
      m.thumbnail_url AS featured_image_thumbnail,
      m.alt_text AS featured_image_alt
    FROM platform_updates pu
    LEFT JOIN authors a
      ON pu.author_id = a.id
    LEFT JOIN media_library m
      ON m.id = pu.featured_image
    WHERE pu.published = 1
    ORDER BY
      COALESCE(pu.published_at, pu.created_at) DESC
  `).all();

  return result.results || [];
}


export async function getFeaturedPlatformUpdates(db, limit = 5) {
  const result = await db.prepare(`
    SELECT
      pu.*,
      a.name AS author_name,
      a.slug AS author_slug,
      a.avatar_url AS author_avatar,
      a.role AS author_role,
      m.url AS featured_image_url,
      m.thumbnail_url AS featured_image_thumbnail,
      m.alt_text AS featured_image_alt
    FROM platform_updates pu
    LEFT JOIN authors a
      ON pu.author_id = a.id
    LEFT JOIN media_library m
      ON m.id = pu.featured_image
    WHERE pu.published = 1
      AND pu.featured = 1
    ORDER BY
      COALESCE(pu.published_at, pu.created_at) DESC
    LIMIT ?
  `).bind(limit).all();

  return result.results || [];
}


export async function getPlatformUpdateBySlug(db, slug) {
  const result = await db.prepare(`
    SELECT
      pu.*,
      a.name AS author_name,
      a.slug AS author_slug,
      a.avatar_url AS author_avatar,
      a.role AS author_role,
      m.url AS featured_image_url,
      m.thumbnail_url AS featured_image_thumbnail,
      m.alt_text AS featured_image_alt,
      m.width AS featured_image_width,
      m.height AS featured_image_height
    FROM platform_updates pu
    LEFT JOIN authors a
      ON pu.author_id = a.id
    LEFT JOIN media_library m
      ON m.id = pu.featured_image
    WHERE pu.slug = ?
      AND pu.published = 1
    LIMIT 1
  `).bind(slug).first();

  return result || null;
}


export async function getPlatformUpdateById(db, id) {
  const result = await db.prepare(`
    SELECT *
    FROM platform_updates
    WHERE id = ?
    LIMIT 1
  `).bind(id).first();

  return result || null;
}


export async function createPlatformUpdate(db, data) {
  const result = await db.prepare(`
    INSERT INTO platform_updates (
      slug,
      title,
      excerpt,
      content,
      featured_image,
      seo_title,
      seo_description,
      seo_keywords,
      author_id,
      published,
      featured,
      published_at,
      created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.slug,
    data.title,
    data.excerpt || null,
    data.content,
    data.featured_image || null,
    data.seo_title || null,
    data.seo_description || null,
    data.seo_keywords || null,
    data.author_id || null,
    data.published ?? 1,
    data.featured ?? 0,
    data.published_at || null,
    data.created_by || null
  ).run();

  return result;
}


export async function updatePlatformUpdate(db, id, data) {
  const result = await db.prepare(`
    UPDATE platform_updates
    SET
      slug = ?,
      title = ?,
      excerpt = ?,
      content = ?,
      featured_image = ?,
      seo_title = ?,
      seo_description = ?,
      seo_keywords = ?,
      author_id = ?,
      published = ?,
      featured = ?,
      published_at = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    data.slug,
    data.title,
    data.excerpt || null,
    data.content,
    data.featured_image || null,
    data.seo_title || null,
    data.seo_description || null,
    data.seo_keywords || null,
    data.author_id || null,
    data.published ?? 1,
    data.featured ?? 0,
    data.published_at || null,
    id
  ).run();

  return result;
}


export async function deletePlatformUpdate(db, id) {
  return await db.prepare(`
    DELETE FROM platform_updates
    WHERE id = ?
  `).bind(id).run();
}
