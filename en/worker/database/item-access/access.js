import { getResourceConfig } from "./registry.js";
import { getItemScope } from "./policy.js";
import { isItemAssigned } from "./assignments.js";

// ── Central Authorization Function ─────────────────

/**
 * Check if a user can access a specific item.
 *
 * This is the SECOND gate — call AFTER checkPermission() passes.
 *
 * @param {Object} db - D1 database binding
 * @param {Object} user - Authenticated user ({ user_id, role })
 * @param {string} resource - Resource name (e.g. 'casinos')
 * @param {string} action - Action ('read' | 'create' | 'update' | 'delete')
 * @param {Object} item - Database row being accessed (must include id + owner column)
 * @returns {Promise<boolean>}
 */
export async function canAccessItem(db, user, resource, action, item) {
  // 1. No user = no access
  if (!user) return false;

  // 2. Admin bypasses item-level checks
  //    (but admin config is separate — see admin API)
  if (user.role === 'admin') return true;

  // 3. Unregistered resource = no item-level control = allow
  const config = getResourceConfig(resource);
  if (!config) return true;

  // 4. Get scope (from explicit row OR system default)
  const scope = await getItemScope(db, user.user_id, resource, action);

  // 5. Evaluate scope
  switch (scope) {
    case 'all':
      return true;

    case 'none':
      return false;

    case 'own':
      // User can only access items they created
      // NULL created_by = legacy record = DENY (NULL ≠ user.id)
      if (!item) return false;
      const ownerId = item[config.ownerColumn];
      if (ownerId === null || ownerId === undefined) return false;
      return Number(ownerId) === Number(user.user_id);

    case 'assigned':
      // User can only access explicitly assigned items
      if (!item) return false;
      return await isItemAssigned(
        db, user.user_id, resource, Number(item[config.idColumn])
      );

    default:
      // Unknown scope = DENY (fail safe)
      return false;
  }
}

// ── List Query Filter Builder ─────────────────────

/**
 * Build a SQL WHERE clause fragment + bind params for item-level filtering.
 *
 * Inject this into list queries so unauthorized records never leave D1.
 *
 * @param {Object} db - D1 database binding
 * @param {Object} user - Authenticated user ({ user_id, role })
 * @param {string} resource - Resource name
 * @param {string} action - Action (usually 'read')
 * @param {string} tableAlias - SQL alias (e.g. 'c' for casinos, 'pu' for platform_updates)
 * @returns {Promise<{ condition: string, params: Array }>}
 *
 * Returns:
 *   ALL       → { condition: '', params: [] }
 *   NONE      → { condition: '1=0', params: [] }
 *   OWN       → { condition: 'alias.created_by = ?', params: [userId] }
 *   ASSIGNED  → { condition: 'alias.id IN (SELECT ...)', params: [...] }
 */
export async function getAccessibleWhereClause(
  db, user, resource, action = 'read', tableAlias = ''
) {
  // No user = deny all
  if (!user) return { condition: '1=0', params: [] };

  // Admin = no restriction
  if (user.role === 'admin') return { condition: '', params: [] };

  // Unregistered resource = no item-level control
  const config = getResourceConfig(resource);
  if (!config) return { condition: '', params: [] };

  // Get scope (explicit row OR system default)
  const scope = await getItemScope(db, user.user_id, resource, action);

  const prefix = tableAlias ? `${tableAlias}.` : '';

  switch (scope) {
    case 'all':
      return { condition: '', params: [] };

    case 'none':
      return { condition: '1=0', params: [] };

    case 'own':
      return {
        condition: `${prefix}${config.ownerColumn} = ?`,
        params: [user.user_id]
      };

    case 'assigned':
      return {
        condition: `${prefix}${config.idColumn} IN (
          SELECT item_id FROM item_access_assignments
          WHERE user_id = ? AND resource = ?
        )`,
        params: [user.user_id, resource]
      };

    default:
      // Unknown scope = deny (fail safe)
      return { condition: '1=0', params: [] };
  }
}

// Alias for backward compatibility
export const getItemAccessCondition = getAccessibleWhereClause;

/**
 * Like getAccessibleWhereClause, but for querying a table OTHER than
 * the resource's own table — e.g. filtering analytics_daily rows by
 * which casinos the user may see, where the column holding the
 * casino ID is `dimension_id`, not `casinos.id`.
 *
 * getAccessibleWhereClause assumes the query targets the resource's
 * own table and hard-codes its idColumn/ownerColumn names into the
 * condition; that assumption doesn't hold for analytics/reporting
 * tables that merely reference a resource by ID under an unrelated
 * column name. This function produces the equivalent condition
 * against an arbitrary `targetColumn`, reusing the exact same scope
 * lookup (getItemScope) and the exact same 'own'/'assigned' semantics
 * — no new authorization logic, just a different column to constrain.
 *
 * Always returns a non-empty, always-valid boolean SQL fragment
 * ('1=1' / '1=0' / a real condition) so callers can safely splice it
 * with `AND ${condition}` without a special case for "no restriction".
 */
export async function getAccessibleIdCondition(db, user, resource, action, targetColumn) {
  if (!user) return { condition: '1=0', params: [] };
  if (user.role === 'admin') return { condition: '1=1', params: [] };

  const config = getResourceConfig(resource);
  if (!config) return { condition: '1=1', params: [] };

  const scope = await getItemScope(db, user.user_id, resource, action);

  switch (scope) {
    case 'all':
      return { condition: '1=1', params: [] };

    case 'none':
      return { condition: '1=0', params: [] };

    case 'own':
      return {
        condition: `${targetColumn} IN (SELECT ${config.idColumn} FROM ${config.table} WHERE ${config.ownerColumn} = ?)`,
        params: [user.user_id]
      };

    case 'assigned':
      return {
        condition: `${targetColumn} IN (
          SELECT item_id FROM item_access_assignments
          WHERE user_id = ? AND resource = ?
        )`,
        params: [user.user_id, resource]
      };

    default:
      return { condition: '1=0', params: [] };
  }
}
