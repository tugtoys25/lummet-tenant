export async function getPermissionsByRole(db, role) {
  const result = await db.prepare(`
    SELECT resource, action, allowed FROM permissions
    WHERE role = ?
  `).bind(role).all();
  return result.results || [];
}

export async function getAllPermissions(db) {
  const result = await db.prepare(`
    SELECT * FROM permissions ORDER BY role, resource, action
  `).all();
  return result.results || [];
}

export async function getPermissionMatrix(db) {
  const all = await getAllPermissions(db);
  const matrix = {};
  for (const p of all) {
    if (!matrix[p.role]) matrix[p.role] = {};
    if (!matrix[p.role][p.resource]) matrix[p.role][p.resource] = {};
    matrix[p.role][p.resource][p.action] = p.allowed === 1;
  }
  return matrix;
}

export async function setPermission(db, role, resource, action, allowed) {
  return await db.prepare(`
    INSERT INTO permissions (role, resource, action, allowed)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(role, resource, action) DO UPDATE SET
      allowed = excluded.allowed
  `).bind(role, resource, action, allowed ? 1 : 0).run();
}

export async function deletePermission(db, id) {
  return await db.prepare(`DELETE FROM permissions WHERE id = ?`).bind(id).run();
}

export async function getPermissionsForUser(db, user) {
  if (!user) return {};
  if (user.role === 'admin') return null; // null = all allowed

  const rows = await getPermissionsByRole(db, user.role);
  const perms = {};
  for (const row of rows) {
    if (!perms[row.resource]) perms[row.resource] = {};
    perms[row.resource][row.action] = row.allowed === 1;
  }
  return perms;
}

export function checkPermission(userPermissions, resource, action) {
  if (userPermissions === null) return true; // admin
  if (!userPermissions || !userPermissions[resource]) return false;
  return userPermissions[resource][action] === true;
}
