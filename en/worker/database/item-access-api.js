// =====================================================
// item-access-api.js — Admin API for item-level access
// All endpoints require admin role.
// Mounted in api.js after existing permissions management.
// =====================================================

import {
  getAllUserItemAccess,
  setUserItemAccess,
  deleteUserItemAccess,
  assignItem,
  unassignItem,
  getAccessibleItemIds,
  getItemAssignees,
  getRegisteredResources,
  getItemScope,
  getSystemDefaultScope,
  setSystemDefaultScope
} from './item-access.js';

function forbid(user) {
  return !user || user.role !== 'admin';
}

// ── User scope management ──

/**
 * GET /api/v1/admin/item-access/user?user_id=X
 * Returns all item-level access rules for a user.
 */
export async function handleGetUserItemAccess(request, env, user) {
  if (forbid(user)) return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const userId = parseInt(url.searchParams.get('user_id'), 10);
  if (!userId) return Response.json({ success: false, error: 'user_id is required' }, { status: 400 });

  const access = await getAllUserItemAccess(env.DB, userId);
  const defaultScope = await getSystemDefaultScope(env.DB);

  return Response.json({ success: true, access, defaultScope });
}

/**
 * POST /api/v1/admin/item-access/set
 * Body: { user_id, resource, action, scope }
 */
export async function handleSetUserItemAccess(request, env, user) {
  if (forbid(user)) return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  if (!body.user_id || !body.resource || !body.action || !body.scope) {
    return Response.json({ success: false, error: 'user_id, resource, action, and scope are required' }, { status: 400 });
  }

  const resources = getRegisteredResources();
  if (!resources.includes(body.resource)) {
    return Response.json({ success: false, error: `Invalid resource. Must be one of: ${resources.join(', ')}` }, { status: 400 });
  }

  try {
    await setUserItemAccess(env.DB, body.user_id, body.resource, body.action, body.scope);
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ success: false, error: e.message }, { status: 400 });
  }
}

/**
 * POST /api/v1/admin/item-access/delete
 * Body: { user_id, resource, action }
 * Reverts to system default scope.
 */
export async function handleDeleteUserItemAccess(request, env, user) {
  if (forbid(user)) return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  if (!body.user_id || !body.resource || !body.action) {
    return Response.json({ success: false, error: 'user_id, resource, and action are required' }, { status: 400 });
  }

  await deleteUserItemAccess(env.DB, body.user_id, body.resource, body.action);
  return Response.json({ success: true });
}

// ── Assignment management ──

/**
 * POST /api/v1/admin/item-access/assign
 * Body: { user_id, resource, item_id }
 */
export async function handleAssignItem(request, env, user) {
  if (forbid(user)) return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  if (!body.user_id || !body.resource || !body.item_id) {
    return Response.json({ success: false, error: 'user_id, resource, and item_id are required' }, { status: 400 });
  }

  await assignItem(env.DB, body.user_id, body.resource, body.item_id, user.user_id);
  return Response.json({ success: true });
}

/**
 * POST /api/v1/admin/item-access/unassign
 * Body: { user_id, resource, item_id }
 */
export async function handleUnassignItem(request, env, user) {
  if (forbid(user)) return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  if (!body.user_id || !body.resource || !body.item_id) {
    return Response.json({ success: false, error: 'user_id, resource, and item_id are required' }, { status: 400 });
  }

  await unassignItem(env.DB, body.user_id, body.resource, body.item_id);
  return Response.json({ success: true });
}

/**
 * GET /api/v1/admin/item-access/assignments?user_id=X&resource=Y
 * Returns all item IDs assigned to a user for a resource.
 */
export async function handleGetUserAssignments(request, env, user) {
  if (forbid(user)) return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const userId = parseInt(url.searchParams.get('user_id'), 10);
  const resource = url.searchParams.get('resource');
  if (!userId || !resource) {
    return Response.json({ success: false, error: 'user_id and resource are required' }, { status: 400 });
  }

  const itemIds = await getAccessibleItemIds(env.DB, userId, resource);
  return Response.json({ success: true, item_ids: itemIds });
}

/**
 * GET /api/v1/admin/item-access/assignees?resource=X&item_id=Y
 * Returns all users assigned to a specific item.
 */
export async function handleGetItemAssignees(request, env, user) {
  if (forbid(user)) return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const resource = url.searchParams.get('resource');
  const itemId = parseInt(url.searchParams.get('item_id'), 10);
  if (!resource || !itemId) {
    return Response.json({ success: false, error: 'resource and item_id are required' }, { status: 400 });
  }

  const assignees = await getItemAssignees(env.DB, resource, itemId);
  return Response.json({ success: true, assignees });
}

// ── System default scope ──

/**
 * GET /api/v1/admin/item-access/default-scope
 * Returns the current system default scope.
 */
export async function handleGetDefaultScope(request, env, user) {
  if (forbid(user)) return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });

  const scope = await getSystemDefaultScope(env.DB);
  return Response.json({ success: true, scope });
}

/**
 * POST /api/v1/admin/item-access/default-scope
 * Body: { scope }
 * Sets the system default scope.
 */
export async function handleSetDefaultScope(request, env, user) {
  if (forbid(user)) return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  if (!body.scope) return Response.json({ success: false, error: 'scope is required' }, { status: 400 });

  try {
    await setSystemDefaultScope(env.DB, body.scope);
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ success: false, error: e.message }, { status: 400 });
  }
}

// ── Resource list ──

/**
 * GET /api/v1/admin/item-access/resources
 * Returns all resources that support item-level access.
 */
export async function handleGetResources(request, env, user) {
  if (forbid(user)) return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });

  return Response.json({ success: true, resources: getRegisteredResources() });
}
