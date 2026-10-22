import { FALLBACK_DEFAULT_SCOPE, VALID_ACTIONS, VALID_SCOPES } from "./registry.js";

// ── System Default Scope ───────────────────────────

/**
 * Get the system-wide default scope used when no user_item_access row exists.
 * This is an EXPLICIT policy stored in system_settings, not an accident.
 *
 * Transition period: 'all' (backward compatible)
 * Production: 'none' (secure — admin must explicitly grant access)
 */
export async function getSystemDefaultScope(db) {
  try {
    const row = await db.prepare(
      `SELECT value FROM system_settings WHERE key = 'item_access_default_scope' LIMIT 1`
    ).first();
    if (row && VALID_SCOPES.includes(row.value)) return row.value;
  } catch (e) {
    // Table might not exist yet during early migration
  }
  return FALLBACK_DEFAULT_SCOPE;
}

/**
 * Set the system-wide default scope.
 * Admin-only — called from admin API.
 */
export async function setSystemDefaultScope(db, scope) {
  if (!VALID_SCOPES.includes(scope)) {
    throw new Error(`Invalid scope: ${scope}. Must be one of: ${VALID_SCOPES.join(', ')}`);
  }
  return await db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES ('item_access_default_scope', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).bind(scope).run();
}

// ── Scope Policy CRUD ─────────────────────────────

/**
 * Get a user's item-level scope for a specific resource + action.
 * If no row exists, returns the system default scope (explicit policy).
 */
export async function getItemScope(db, userId, resource, action = 'read') {
  const row = await db.prepare(`
    SELECT scope FROM user_item_access
    WHERE user_id = ? AND resource = ? AND action = ?
    LIMIT 1
  `).bind(userId, resource, action).first();

  if (row) return row.scope;

  // No explicit row — use system default (NOT a hardcoded 'all')
  return await getSystemDefaultScope(db);
}

/**
 * Alias for backward compatibility
 */
export const getUserItemAccess = getItemScope;

/**
 * Set a user's item-level scope for a specific resource + action.
 */
export async function setUserItemAccess(db, userId, resource, action, scope) {
  if (!VALID_SCOPES.includes(scope)) {
    throw new Error(`Invalid scope: ${scope}. Must be one of: ${VALID_SCOPES.join(', ')}`);
  }
  if (!VALID_ACTIONS.includes(action)) {
    throw new Error(`Invalid action: ${action}. Must be one of: ${VALID_ACTIONS.join(', ')}`);
  }

  return await db.prepare(`
    INSERT INTO user_item_access (user_id, resource, action, scope, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, resource, action)
    DO UPDATE SET scope = excluded.scope, updated_at = CURRENT_TIMESTAMP
  `).bind(userId, resource, action, scope).run();
}

/**
 * Delete a user's item-level scope.
 * Removing the row reverts to system default scope.
 */
export async function deleteUserItemAccess(db, userId, resource, action) {
  return await db.prepare(`
    DELETE FROM user_item_access
    WHERE user_id = ? AND resource = ? AND action = ?
  `).bind(userId, resource, action).run();
}

/**
 * Get all item-level access rules for a user.
 */
export async function getAllUserItemAccess(db, userId) {
  const result = await db.prepare(`
    SELECT resource, action, scope FROM user_item_access
    WHERE user_id = ?
    ORDER BY resource, action
  `).bind(userId).all();

  return result.results || [];
}
