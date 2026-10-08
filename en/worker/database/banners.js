export async function getActiveBanners(db, country) {
  const result = await db.prepare(`
    SELECT * FROM banners
    WHERE enabled = 1
    AND (start_date IS NULL OR datetime(start_date) <= datetime('now'))
    AND (end_date IS NULL OR datetime(end_date) >= datetime('now'))
    AND (geo_countries IS NULL OR geo_countries = '' OR geo_countries LIKE ?)
    ORDER BY position ASC
  `).bind(`%${country}%`).all();
  return result.results || [];
}

export async function getAllBanners(db) {
  const result = await db.prepare(`
    SELECT * FROM banners ORDER BY created_at DESC
  `).all();
  return result.results || [];
}

export async function getBanner(db, id) {
  return await db.prepare(`SELECT * FROM banners WHERE id = ?`).bind(id).first();
}

export async function createBanner(db, data) {
  const result = await db.prepare(`
    INSERT INTO banners (type, title, content, link, button_text, bg_color, text_color, position, dismissible, geo_countries, start_date, end_date, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.type || "announcement",
    data.title || null,
    data.content || null,
    data.link || null,
    data.button_text || null,
    data.bg_color || "#6c5ce7",
    data.text_color || "#ffffff",
    data.position || "top",
    data.dismissible !== undefined ? (data.dismissible ? 1 : 0) : 1,
    data.geo_countries || null,
    data.start_date || null,
    data.end_date || null,
    data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1
  ).run();
  return result.meta.last_row_id;
}

export async function updateBanner(db, id, data) {
  return await db.prepare(`
    UPDATE banners SET
      type = ?, title = ?, content = ?, link = ?, button_text = ?,
      bg_color = ?, text_color = ?, position = ?, dismissible = ?,
      geo_countries = ?, start_date = ?, end_date = ?, enabled = ?
    WHERE id = ?
  `).bind(
    data.type || "announcement",
    data.title || null,
    data.content || null,
    data.link || null,
    data.button_text || null,
    data.bg_color || "#6c5ce7",
    data.text_color || "#ffffff",
    data.position || "top",
    data.dismissible !== undefined ? (data.dismissible ? 1 : 0) : 1,
    data.geo_countries || null,
    data.start_date || null,
    data.end_date || null,
    data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
    id
  ).run();
}

export async function deleteBanner(db, id) {
  return await db.prepare(`DELETE FROM banners WHERE id = ?`).bind(id).run();
}
