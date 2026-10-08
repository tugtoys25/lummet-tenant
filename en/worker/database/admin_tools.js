// ── User Management ──

export async function getAllUsers(db) {
  const result = await db.prepare(`
    SELECT id, email, role, created_at FROM users ORDER BY created_at DESC
  `).all();
  return result.results || [];
}

export async function getUserById(db, id) {
  return await db.prepare(`
    SELECT id, email, role, created_at FROM users WHERE id = ?
  `).bind(id).first();
}

// "New users" recipient type for the email composer -- registered
// within the last N days.
export async function getRecentUsers(db, sinceDays) {
  const result = await db.prepare(`
    SELECT id, email, role, created_at FROM users
    WHERE created_at >= datetime('now', '-' || ? || ' days')
    ORDER BY created_at DESC
  `).bind(sinceDays).all();
  return result.results || [];
}

export async function updateUserRole(db, id, role) {
  return await db.prepare(`
    UPDATE users SET role = ? WHERE id = ?
  `).bind(role, id).run();
}

export async function deleteUser(db, id) {
  // Prevent deleting the last admin
  const adminCount = await db.prepare(`
    SELECT COUNT(*) as c FROM users WHERE role = 'admin'
  `).first();
  if (adminCount.c <= 1) {
    const user = await getUserById(db, id);
    if (user?.role === 'admin') {
      throw new Error("Cannot delete the last admin user");
    }
  }

  // Clean up user data
  await db.prepare(`DELETE FROM user_bookmarks WHERE user_id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM user_inquiries WHERE user_id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM user_notifications WHERE user_id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM casino_submissions WHERE user_id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(id).run();
  return await db.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();
}

// ── Send Notification to All Users ──

export async function sendNotificationToAll(db, title, message, link = null) {
  const users = await getAllUsers(db);
  for (const user of users) {
    await db.prepare(`
      INSERT INTO user_notifications (user_id, title, message, link)
      VALUES (?, ?, ?, ?)
    `).bind(user.id, title, message, link).run();
  }
  return users.length;
}

export async function sendNotificationToUser(db, userId, title, message, link = null) {
  return await db.prepare(`
    INSERT INTO user_notifications (user_id, title, message, link)
    VALUES (?, ?, ?, ?)
  `).bind(userId, title, message, link).run();
}

export async function sendNotificationToRole(db, role, title, message, link = null) {
  const result = await db.prepare(`
    SELECT id FROM users WHERE role = ?
  `).bind(role).all();
  const users = result.results || [];
  for (const user of users) {
    await db.prepare(`
      INSERT INTO user_notifications (user_id, title, message, link)
      VALUES (?, ?, ?, ?)
    `).bind(user.id, title, message, link).run();
  }
  return users.length;
}
