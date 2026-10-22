// ── Assignment CRUD ───────────────────────────────

/**
 * Assign a specific item to a user.
 * Used when scope = 'assigned'.
 */
export async function assignItem(db, userId, resource, itemId, assignedBy = null) {
  return await db.prepare(`
    INSERT INTO item_access_assignments (user_id, resource, item_id, created_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, resource, item_id)
    DO NOTHING
  `).bind(userId, resource, itemId, assignedBy).run();
}

/**
 * Remove an item assignment from a user.
 */
export async function unassignItem(db, userId, resource, itemId) {
  return await db.prepare(`
    DELETE FROM item_access_assignments
    WHERE user_id = ? AND resource = ? AND item_id = ?
  `).bind(userId, resource, itemId).run();
}

/**
 * Check if a specific item is assigned to a user.
 */
export async function isItemAssigned(db, userId, resource, itemId) {
  const row = await db.prepare(`
    SELECT 1 FROM item_access_assignments
    WHERE user_id = ? AND resource = ? AND item_id = ?
    LIMIT 1
  `).bind(userId, resource, itemId).first();

  return !!row;
}

/**
 * Get all item IDs assigned to a user for a resource.
 */
export async function getAccessibleItemIds(db, userId, resource) {
  const result = await db.prepare(`
    SELECT item_id FROM item_access_assignments
    WHERE user_id = ? AND resource = ?
    ORDER BY item_id
  `).bind(userId, resource).all();

  return (result.results || []).map(r => r.item_id);
}

/**
 * Get all users assigned to a specific item.
 */
export async function getItemAssignees(db, resource, itemId) {
  const result = await db.prepare(`
    SELECT ia.user_id, u.email, u.role, ia.created_at
    FROM item_access_assignments ia
    JOIN users u ON u.id = ia.user_id
    WHERE ia.resource = ? AND ia.item_id = ?
    ORDER BY ia.created_at DESC
  `).bind(resource, itemId).all();

  return result.results || [];
}
