// comparisons / comparison_items (migration 0051). First-class,
// SEO-indexable comparison pages -- separate from the existing
// database-driven `comparison_table` component (component-engine.js
// + components/comparison_table.html), which is an admin-authored
// embeddable widget with its own JSON content shape and stays
// untouched. This module backs the new persistent comparisons table
// instead of trying to force-fit the two together -- see the Phase 6
// report's note on this for the reasoning.
//
// Both a comparison's items AND its editorial selection use an
// explicit (item_type, item_id) pair, never a bare ID, since either
// can point at `casinos` or `content_items` depending on content_type
// (per the earlier correction to the Phase 1 design).

export async function getComparison(db, contentType, slug) {
  return db.prepare(`
    SELECT * FROM comparisons WHERE content_type = ? AND slug = ? LIMIT 1
  `).bind(contentType, slug).first();
}

export async function getComparisonItems(db, comparisonId) {
  const result = await db.prepare(`
    SELECT * FROM comparison_items WHERE comparison_id = ? ORDER BY position ASC
  `).bind(comparisonId).all();
  return result.results || [];
}

export async function getPublishedComparisons(db, contentType, { limit = 100, offset = 0 } = {}) {
  const result = await db.prepare(`
    SELECT * FROM comparisons WHERE content_type = ? AND status = 'published'
    ORDER BY updated_at DESC LIMIT ? OFFSET ?
  `).bind(contentType, limit, offset).all();
  return result.results || [];
}

/**
 * All comparisons of a type, any status -- for admin listings. Added
 * because the admin comparisons list was calling
 * getPublishedComparisons() (published-only), so an admin could never
 * see or open a draft comparison to edit it from that list. `status`
 * (optional) restricts to one lifecycle status; `extraCondition`/
 * `extraParams` let the caller AND in an item-level access scoping
 * clause the same way content-items.js's getAllContentItems() does.
 */
export async function getAllComparisons(db, contentType, { status = null, extraCondition = null, extraParams = [], limit = 200, offset = 0, withTotal = false } = {}) {
  const clauses = ["content_type = ?"];
  const params = [contentType];
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (extraCondition) {
    clauses.push(extraCondition);
    params.push(...extraParams);
  }
  const where = clauses.join(" AND ");
  const result = await db.prepare(`
    SELECT * FROM comparisons WHERE ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();
  const items = result.results || [];
  if (!withTotal) return items; // existing callers unaffected
  const total = (await db.prepare(`SELECT COUNT(*) n FROM comparisons WHERE ${where}`).bind(...params).first()).n;
  return { items, total };
}

/**
 * Public-safe singular lookup, gated on status = 'published' -- added
 * because renderComparison() in controllers.js was calling
 * getComparison() (unfiltered) directly with no status check at all,
 * so a draft comparison was fully reachable at its own public URL.
 * comparisons has no separate boolean "published" column (unlike
 * content_items); status is the only gate.
 */
export async function getPublishedComparison(db, contentType, slug) {
  return db.prepare(`
    SELECT * FROM comparisons WHERE content_type = ? AND slug = ? AND status = 'published' LIMIT 1
  `).bind(contentType, slug).first();
}

/**
 * Delete a comparison and its items. comparison_items has an
 * ON DELETE CASCADE FK to comparisons(id) (migration 0051), but this
 * deletes explicitly rather than relying on it -- the D1 shim/test
 * environment and some SQLite configurations don't enforce FKs unless
 * PRAGMA foreign_keys=ON is set per-connection, so this stays correct
 * either way. Returns the deleted row, or null if nothing matched.
 */
export async function deleteComparison(db, contentType, slug) {
  const existing = await getComparison(db, contentType, slug);
  if (!existing) return null;
  await db.prepare(`DELETE FROM comparison_items WHERE comparison_id = ?`).bind(existing.id).run();
  await db.prepare(`DELETE FROM comparisons WHERE id = ?`).bind(existing.id).run();
  return existing;
}

/**
 * Create a comparison plus its items in one call. items is an array
 * of { itemContentType, itemId, position }. Write path for a future
 * admin form -- not wired to a UI yet, same posture as every other
 * *_items/createX helper in this project. Runs as a manual two-step
 * write (D1 has no multi-statement transaction API exposed the way
 * raw SQLite does) -- if the items insert fails after the comparison
 * row succeeds, the caller gets the partial comparison id back in
 * the thrown error's context so it can clean up or retry the items
 * only, rather than silently leaving an inconsistent comparison with
 * items missing.
 */
export async function updateComparison(db, id, { title, description, criteria, editorialSelectionItemType, editorialSelectionItemId, status, seoTitle, seoDescription, items }) {
  const sets = [];
  const values = [];
  if (title !== undefined) { sets.push("title = ?"); values.push(title); }
  if (description !== undefined) { sets.push("description = ?"); values.push(description); }
  if (criteria !== undefined) { sets.push("criteria_json = ?"); values.push(JSON.stringify(criteria)); }
  if (editorialSelectionItemType !== undefined) { sets.push("editorial_selection_item_type = ?"); values.push(editorialSelectionItemType); }
  if (editorialSelectionItemId !== undefined) { sets.push("editorial_selection_item_id = ?"); values.push(editorialSelectionItemId); }
  if (status !== undefined) {
    sets.push("status = ?"); values.push(status);
    sets.push("published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE published_at END");
    values.push(status);
  }
  if (seoTitle !== undefined) { sets.push("seo_title = ?"); values.push(seoTitle); }
  if (seoDescription !== undefined) { sets.push("seo_description = ?"); values.push(seoDescription); }
  sets.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  const comparison = await db.prepare(`UPDATE comparisons SET ${sets.join(", ")} WHERE id = ? RETURNING *`).bind(...values).first();

  if (Array.isArray(items)) {
    // Full replace of items -- simplest safe approach for a form that
    // always resubmits its whole item list, same posture as
    // setContentItemCustomFieldValues(). Not a transaction (D1's
    // console-safety constraints, see POST-DEPLOYMENT-FIX-0052.md),
    // so a failure between delete and re-insert could leave the
    // comparison briefly without items -- acceptable for an
    // admin-only write path with no concurrent readers expected at
    // that exact moment, but worth knowing if this is ever exposed
    // more broadly.
    await db.prepare(`DELETE FROM comparison_items WHERE comparison_id = ?`).bind(id).run();
    for (const item of items) {
      await db.prepare(`
        INSERT INTO comparison_items (comparison_id, item_content_type, item_id, position) VALUES (?, ?, ?, ?)
      `).bind(id, item.itemContentType, item.itemId, item.position ?? 0).run();
    }
  }

  return comparison;
}

export async function createComparison(db, {
  contentType, slug, title, description = null, criteria = [],
  editorialSelectionItemType = null, editorialSelectionItemId = null,
  status = "draft", seoTitle = null, seoDescription = null, seoKeywords = null,
  authorId = null, createdBy = null, items = [],
}) {
  const comparison = await db.prepare(`
    INSERT INTO comparisons (
      content_type, slug, title, description, criteria_json,
      editorial_selection_item_type, editorial_selection_item_id,
      status, seo_title, seo_description, seo_keywords, author_id, created_by,
      published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).bind(
    contentType, slug, title, description, JSON.stringify(criteria),
    editorialSelectionItemType, editorialSelectionItemId,
    status, seoTitle, seoDescription, seoKeywords, authorId, createdBy,
    status === "published" ? new Date().toISOString() : null
  ).first();

  try {
    for (const item of items) {
      await db.prepare(`
        INSERT INTO comparison_items (comparison_id, item_content_type, item_id, position)
        VALUES (?, ?, ?, ?)
      `).bind(comparison.id, item.itemContentType, item.itemId, item.position ?? 0).run();
    }
  } catch (e) {
    e.comparisonId = comparison.id; // partial-write context for the caller, see doc comment above
    throw e;
  }

  return comparison;
}
