export async function getPage(db, slug) {
  return await db
    .prepare(`
      SELECT *
      FROM pages
      WHERE slug = ?
      LIMIT 1
    `)
    .bind(slug)
    .first();
}

export async function createPage(db, page) {
  return await db
    .prepare(`
      INSERT INTO pages (
        slug, type, template, title, content_json, seo_title, seo_description, seo_keywords, author_id, published, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `)
    .bind(
      page.slug,
      page.type,
      page.template,
      page.title,
      JSON.stringify(page.content_json || {}),
      page.seo_title,
      page.seo_description,
      page.seo_keywords || null,
      page.author_id || null,
      page.created_by || null
    )
    .run();
}

export async function updatePage(db, slug, page) {
  return db.prepare(`
    UPDATE pages
    SET
      title=?, content_json=?, seo_title=?, seo_description=?, seo_keywords=?, author_id=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE slug=?
  `)
  .bind(
    page.title,
    JSON.stringify(page.content_json || {}),
    page.seo_title,
    page.seo_description,
    page.seo_keywords || null,
    page.author_id || null,
    slug
  )
  .run();
}


export async function deletePage(db, slug) {
  return db.prepare(`
    DELETE FROM pages WHERE slug=?
  `)
  .bind(slug)
  .run();
}

export async function getAllPages(db) {
  const result = await db.prepare(`
    SELECT * FROM pages ORDER BY created_at DESC
  `).all();
  return result.results || [];
}
