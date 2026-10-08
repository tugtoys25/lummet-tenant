// =====================================================
// REVIEW BLOCKS DATABASE MODULE
// =====================================================

export async function getReviewBlocks(db, reviewSlug) {
  const result = await db.prepare(`
    SELECT * FROM review_blocks
    WHERE review_slug = ?
    ORDER BY position ASC
  `).bind(reviewSlug).all();
  return result.results || [];
}

export async function createReviewBlock(db, data) {
  const result = await db.prepare(`
    INSERT INTO review_blocks (review_slug, title, content, position)
    VALUES (?, ?, ?, ?)
  `).bind(
    data.review_slug,
    data.title,
    data.content,
    data.position || 0
  ).run();
  return result.meta.last_row_id;
}

export async function updateReviewBlock(db, id, data) {
  return await db.prepare(`
    UPDATE review_blocks SET
      title = ?,
      content = ?,
      position = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    data.title,
    data.content,
    data.position || 0,
    id
  ).run();
}

export async function deleteReviewBlock(db, id) {
  return await db.prepare(`DELETE FROM review_blocks WHERE id = ?`).bind(id).run();
}

export async function deleteReviewBlocksBySlug(db, reviewSlug) {
  return await db.prepare(`
    DELETE FROM review_blocks WHERE review_slug = ?
  `).bind(reviewSlug).run();
}

export async function syncReviewBlocks(db, reviewSlug, blocks) {
  await deleteReviewBlocksBySlug(db, reviewSlug);
  if (!blocks || !blocks.length) return;
  for (let i = 0; i < blocks.length; i++) {
    await db.prepare(`
      INSERT INTO review_blocks (review_slug, title, content, position)
      VALUES (?, ?, ?, ?)
    `).bind(reviewSlug, blocks[i].title, blocks[i].content, i).run();
  }
}
