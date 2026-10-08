// ── Bookmarks ──

export async function addBookmark(db, userId, casinoSlug) {
  return await db.prepare(`
    INSERT OR IGNORE INTO user_bookmarks (user_id, casino_slug)
    VALUES (?, ?)
  `).bind(userId, casinoSlug).run();
}

export async function removeBookmark(db, userId, casinoSlug) {
  return await db.prepare(`
    DELETE FROM user_bookmarks WHERE user_id = ? AND casino_slug = ?
  `).bind(userId, casinoSlug).run();
}

export async function getBookmarks(db, userId) {
  const result = await db.prepare(`
    SELECT b.*, c.name, c.logo, c.rating, c.bonus_title, c.bonus_value, c.slug
    FROM user_bookmarks b
    JOIN casinos c ON c.slug = b.casino_slug
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
  `).bind(userId).all();
  return result.results || [];
}

export async function isBookmarked(db, userId, casinoSlug) {
  const row = await db.prepare(`
    SELECT COUNT(*) as c FROM user_bookmarks
    WHERE user_id = ? AND casino_slug = ?
  `).bind(userId, casinoSlug).first();
  return (row?.c || 0) > 0;
}

// ── Inquiries ──

export async function createInquiry(db, userId, subject, message) {
  const result = await db.prepare(`
    INSERT INTO user_inquiries (user_id, subject, message)
    VALUES (?, ?, ?)
  `).bind(userId, subject, message).run();
  return result.meta.last_row_id;
}

export async function getInquiries(db, userId) {
  const result = await db.prepare(`
    SELECT * FROM user_inquiries
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).bind(userId).all();
  return result.results || [];
}

export async function getAllInquiries(db) {
  const result = await db.prepare(`
    SELECT i.*, u.email as user_email
    FROM user_inquiries i
    JOIN users u ON u.id = i.user_id
    ORDER BY i.created_at DESC
  `).all();
  return result.results || [];
}

export async function replyToInquiry(db, inquiryId, reply) {
  return await db.prepare(`
    UPDATE user_inquiries SET
      admin_reply = ?, status = 'answered', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(reply, inquiryId).run();
}

// ── Notifications ──

export async function createNotification(db, userId, title, message, link = null) {
  return await db.prepare(`
    INSERT INTO user_notifications (user_id, title, message, link)
    VALUES (?, ?, ?, ?)
  `).bind(userId, title, message, link).run();
}

export async function getNotifications(db, userId) {
  const result = await db.prepare(`
    SELECT * FROM user_notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).bind(userId).all();
  return result.results || [];
}

export async function markNotificationRead(db, notifId) {
  return await db.prepare(`
    UPDATE user_notifications SET is_read = 1 WHERE id = ?
  `).bind(notifId).run();
}

export async function markAllNotificationsRead(db, userId) {
  return await db.prepare(`
    UPDATE user_notifications SET is_read = 1 WHERE user_id = ?
  `).bind(userId).run();
}

// ── Casino Submissions ──

export async function createSubmission(db, userId, data) {
  const result = await db.prepare(`
    INSERT INTO casino_submissions (user_id, name, website_url, affiliate_url, bonus_value, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    data.name,
    data.website_url,
    data.affiliate_url || null,
    data.bonus_value || null,
    data.notes || null
  ).run();
  return result.meta.last_row_id;
}

export async function getSubmissions(db, userId) {
  const result = await db.prepare(`
    SELECT * FROM casino_submissions
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).bind(userId).all();
  return result.results || [];
}

export async function getAllSubmissions(db) {
  const result = await db.prepare(`
    SELECT s.*, u.email as user_email
    FROM casino_submissions s
    JOIN users u ON u.id = s.user_id
    ORDER BY s.created_at DESC
  `).all();
  return result.results || [];
}

export async function updateSubmissionStatus(db, submissionId, status, adminNotes = null) {
  return await db.prepare(`
    UPDATE casino_submissions SET
      status = ?, admin_notes = ?
    WHERE id = ?
  `).bind(status, adminNotes, submissionId).run();
}

// ── User Profile ──

export async function updateUserProfile(db, userId, data) {
  return await db.prepare(`
    UPDATE users SET
      email = ?
    WHERE id = ?
  `).bind(data.email || null, userId).run();
}
