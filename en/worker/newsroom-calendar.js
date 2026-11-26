// worker/newsroom-calendar.js -- quick actions for scheduled stories, used by the dashboard calendar.
// Additive: the existing workflow and article editor are unchanged; these only act on a story that is ALREADY scheduled
// (published = 1 with a future publish time), so they can never publish or hide anything that was not already planned.

import { checkPermission } from './database/permissions.js';
import { logAudit } from './database/audit.js';
import { embargoBlock } from './newsroom-embargo.js';

const toSql = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const parseDb = (v) => { const s = String(v || ''); const t = Date.parse(s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')); return Number.isNaN(t) ? null : t; };
const MIN_LEAD_MS = 60 * 1000, MAX_LEAD_MS = 2 * 365 * 86400 * 1000;

async function loadScheduled(db, id) {
  const row = await db.prepare(`SELECT n.id, n.title, n.published, n.published_at, e.workflow_status FROM news n LEFT JOIN news_editorial e ON e.news_id = n.id WHERE n.id = ?`).bind(Number(id) || 0).first();
  if (!row) return { error: { ok: false, status: 404, error: 'Article not found' } };
  const at = parseDb(row.published_at);
  if (row.published !== 1 || at === null || at <= Date.now()) return { error: { ok: false, status: 409, error: 'Only a scheduled story can be changed from the calendar' } };
  return { row, at };
}

// `expected` (the time the editor saw) guards against two editors changing the same story: the second one is told to reload.
function stale(row, expected) {
  if (expected === undefined || expected === null || expected === '') return false;
  const e = parseDb(expected); return e === null || e !== parseDb(row.published_at);
}

export async function rescheduleArticle(db, { id, at, expected, actor, perms }) {
  if (!checkPermission(perms, 'news', 'schedule')) return { ok: false, status: 403, error: 'Forbidden' };
  const t = Date.parse(String(at || ''));
  if (Number.isNaN(t)) return { ok: false, status: 400, error: 'Choose a valid date and time' };
  if (t < Date.now() + MIN_LEAD_MS) return { ok: false, status: 400, error: 'The new time must be in the future' };
  if (t > Date.now() + MAX_LEAD_MS) return { ok: false, status: 400, error: 'The new time is too far ahead (2 years at most)' };
  const { row, error } = await loadScheduled(db, id); if (error) return error;
  if (stale(row, expected)) return { ok: false, status: 409, error: 'This story was changed by someone else. Reload the calendar and try again.' };
  const blocked = await embargoBlock(db, row.id, t); if (blocked) return blocked;
  const r = await db.prepare(`UPDATE news SET published_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND published = 1 AND published_at = ?`).bind(toSql(t), row.id, row.published_at).run();
  if (!(r.meta?.changes > 0)) return { ok: false, status: 409, error: 'This story was changed by someone else. Reload the calendar and try again.' };
  await logAudit(db, { userId: actor?.user_id ?? null, action: 'article_scheduled', entityType: 'news', entityId: row.id, metadata: { via: 'calendar', from: row.published_at, to: toSql(t) } });
  return { ok: true, published_at: toSql(t) };
}

// Back to a draft: no longer scheduled, nothing public. The text and every other field stay exactly as they were.
export async function unscheduleArticle(db, { id, expected, actor, perms }) {
  if (!checkPermission(perms, 'news', 'schedule')) return { ok: false, status: 403, error: 'Forbidden' };
  const { row, error } = await loadScheduled(db, id); if (error) return error;
  if (stale(row, expected)) return { ok: false, status: 409, error: 'This story was changed by someone else. Reload the calendar and try again.' };
  const r = await db.prepare(`UPDATE news SET published = 0, published_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND published = 1 AND published_at = ?`).bind(row.id, row.published_at).run();
  if (!(r.meta?.changes > 0)) return { ok: false, status: 409, error: 'This story was changed by someone else. Reload the calendar and try again.' };
  await db.prepare(`UPDATE news_editorial SET workflow_status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE news_id = ? AND workflow_status = 'scheduled'`).bind(row.id).run();
  await logAudit(db, { userId: actor?.user_id ?? null, action: 'article_unpublished', entityType: 'news', entityId: row.id, metadata: { via: 'calendar', was: row.published_at } });
  return { ok: true };
}

export async function publishNowArticle(db, { id, expected, actor, perms }) {
  if (!checkPermission(perms, 'news', 'publish')) return { ok: false, status: 403, error: 'Forbidden' };
  const { row, error } = await loadScheduled(db, id); if (error) return error;
  if (stale(row, expected)) return { ok: false, status: 409, error: 'This story was changed by someone else. Reload the calendar and try again.' };
  const blocked = await embargoBlock(db, row.id, Date.now()); if (blocked) return blocked;
  const r = await db.prepare(`UPDATE news SET published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND published = 1 AND published_at = ?`).bind(row.id, row.published_at).run();
  if (!(r.meta?.changes > 0)) return { ok: false, status: 409, error: 'This story was changed by someone else. Reload the calendar and try again.' };
  await db.prepare(`UPDATE news_editorial SET workflow_status = 'published', published_by = ?, updated_at = CURRENT_TIMESTAMP WHERE news_id = ? AND workflow_status = 'scheduled'`).bind(actor?.user_id ?? null, row.id).run();
  await logAudit(db, { userId: actor?.user_id ?? null, action: 'article_published', entityType: 'news', entityId: row.id, metadata: { via: 'calendar', was: row.published_at } });
  return { ok: true };
}

// Names for the calendar's filter menus.
export async function calendarFilters(db) {
  const [sections, authors] = await Promise.all([
    db.prepare(`SELECT id, name FROM news_sections ORDER BY display_order, name LIMIT 200`).all().then((r) => r.results || []).catch(() => []),
    db.prepare(`SELECT id, name FROM authors ORDER BY name LIMIT 300`).all().then((r) => r.results || []).catch(() => [])
  ]);
  return { sections, authors };
}

// ── site time zone ───────────────────────────────────────────
// Times are always STORED in UTC. This setting only decides which clock the admin screens show and accept, so every editor
// sees the same times. Empty = each editor's own browser zone (the behaviour before this setting existed).
const ZONE_KEY = 'site_timezone';
export const isValidZone = (z) => { if (typeof z !== 'string' || !z || z.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(z)) return false; try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; } };

export async function getSiteTimezone(db) {
  try { const r = await db.prepare(`SELECT value FROM system_settings WHERE key = ?`).bind(ZONE_KEY).first(); return r && isValidZone(r.value) ? r.value : ''; } catch { return ''; }
}

export async function saveSiteTimezone(db, zone) {
  const z = String(zone ?? '').trim();
  if (z && !isValidZone(z)) return { ok: false, error: 'That is not a known time zone name. Use a name like Africa/Kigali or Europe/London.' };
  await db.prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).bind(ZONE_KEY, z).run();
  return { ok: true, timezone: z };
}
