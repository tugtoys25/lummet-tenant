// worker/database/newsletter.js
// Storage for newsletter signups. See migrations/0038 for the table.

export async function getSubscriberByEmail(db, email) {
  return db.prepare(`
    SELECT * FROM newsletter_subscribers
    WHERE email = ?
    LIMIT 1
  `).bind(email).first();
}

export async function getSubscriberByToken(db, token) {
  return db.prepare(`
    SELECT * FROM newsletter_subscribers
    WHERE token = ?
    LIMIT 1
  `).bind(token).first();
}

export async function createSubscriber(db, email, token) {
  return db.prepare(`
    INSERT INTO newsletter_subscribers (email, token, status)
    VALUES (?, ?, 'pending')
  `).bind(email, token).run();
}

// Re-issues a fresh confirmation token for someone who signed up
// before but never confirmed and is signing up again.
export async function refreshSubscriberToken(db, id, token) {
  return db.prepare(`
    UPDATE newsletter_subscribers
    SET token = ?
    WHERE id = ?
  `).bind(token, id).run();
}

export async function confirmSubscriber(db, id) {
  return db.prepare(`
    UPDATE newsletter_subscribers
    SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(id).run();
}

export async function unsubscribeSubscriber(db, id) {
  return db.prepare(`
    UPDATE newsletter_subscribers
    SET status = 'unsubscribed', unsubscribed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(id).run();
}

// Lets someone who previously unsubscribed sign up again.
export async function resubscribeSubscriber(db, id) {
  return db.prepare(`
    UPDATE newsletter_subscribers
    SET status = 'pending', unsubscribed_at = NULL
    WHERE id = ?
  `).bind(id).run();
}

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Registration auto-subscribe ──
// Called from worker/auth.js register(). A registered account is
// already a verified email, so this skips the double-opt-in
// confirmation step and lands the subscriber directly as 'confirmed'
// -- source='registration' distinguishes it from a footer signup on
// the subscriptions dashboard. Safe to call more than once for the
// same email (e.g. re-registration edge cases): upserts rather than
// throwing on the UNIQUE(email) constraint.
export async function upsertConfirmedSubscriberForUser(db, userId, email) {
  const existing = await getSubscriberByEmail(db, email);
  if (existing) {
    return db.prepare(`
      UPDATE newsletter_subscribers
      SET user_id = ?,
          status = CASE WHEN status = 'unsubscribed' THEN status ELSE 'confirmed' END,
          confirmed_at = CASE WHEN status = 'unsubscribed' THEN confirmed_at ELSE COALESCE(confirmed_at, CURRENT_TIMESTAMP) END
      WHERE id = ?
    `).bind(userId, existing.id).run();
  }
  const token = generateToken();
  return db.prepare(`
    INSERT INTO newsletter_subscribers (email, token, status, user_id, source, confirmed_at)
    VALUES (?, ?, 'confirmed', ?, 'registration', CURRENT_TIMESTAMP)
  `).bind(email, token, userId).run();
}

// ── Admin: subscriptions dashboard ──

export async function listSubscribers(db, { status = null, search = null, limit = 50, offset = 0 } = {}) {
  const clauses = [];
  const params = [];
  if (status) { clauses.push('status = ?'); params.push(status); }
  if (search) { clauses.push('email LIKE ?'); params.push(`%${search}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await db.prepare(`
    SELECT id, email, status, user_id, source, notify_news, notify_casinos,
           notify_reviews, notify_weekly_report, subscribed_at, confirmed_at, unsubscribed_at
    FROM newsletter_subscribers
    ${where}
    ORDER BY subscribed_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();
  return result.results || [];
}

export async function countSubscribersByStatus(db) {
  const result = await db.prepare(`
    SELECT status, COUNT(*) as count
    FROM newsletter_subscribers
    GROUP BY status
  `).all();
  const counts = { pending: 0, confirmed: 0, unsubscribed: 0 };
  for (const row of result.results || []) counts[row.status] = row.count;
  return counts;
}

// Manually add + immediately confirm an email from the admin dashboard
// (no confirmation round-trip -- an admin adding an address is treated
// as consent already established, same as the registration path).
export async function adminAddSubscriber(db, email) {
  const existing = await getSubscriberByEmail(db, email);
  if (existing) {
    if (existing.status !== 'confirmed') await confirmSubscriber(db, existing.id);
    return existing.id;
  }
  const token = generateToken();
  const result = await db.prepare(`
    INSERT INTO newsletter_subscribers (email, token, status, source, confirmed_at)
    VALUES (?, ?, 'confirmed', 'admin', CURRENT_TIMESTAMP)
  `).bind(email, token).run();
  return result.meta.last_row_id;
}

const NOTIFY_COLUMNS = ['notify_news', 'notify_casinos', 'notify_reviews', 'notify_weekly_report'];

// Confirmed subscribers, optionally filtered to only those who still
// want a given category (column must come from the allow-list above --
// it's a column name, never bindable as a parameter).
export async function getConfirmedSubscribers(db, notifyColumn = null) {
  if (notifyColumn && !NOTIFY_COLUMNS.includes(notifyColumn)) {
    throw new Error(`getConfirmedSubscribers: unknown notify column "${notifyColumn}"`);
  }
  const extra = notifyColumn ? `AND ${notifyColumn} = 1` : '';
  const result = await db.prepare(`
    SELECT id, email, token
    FROM newsletter_subscribers
    WHERE status = 'confirmed' ${extra}
  `).all();
  return result.results || [];
}
