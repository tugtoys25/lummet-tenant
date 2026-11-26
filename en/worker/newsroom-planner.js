// worker/newsroom-planner.js -- editor planning tools: planned dates for drafts (calendar), new stories from the calendar,
// embargoes, and bulk edits. Additive: new tables only; every write is permission-checked and written to the audit log.
// An embargo only ever BLOCKS publishing before its time; it never publishes or hides anything by itself.

import { checkPermission } from './database/permissions.js';
import { logAudit } from './database/audit.js';
import { createNews } from './database/news.js';
import { slugify } from './database/newsroom/base.js';
import { embargoBlock } from './newsroom-embargo.js';

export const MAX_BULK = 100;
const MAX_AHEAD_MS = 2 * 365 * 86400 * 1000;
const toSql = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const parseDb = (v) => { const s = String(v || ''); const t = Date.parse(s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')); return Number.isNaN(t) ? null : t; };
const isoOf = (v) => { const t = parseDb(v); return t === null ? null : new Date(t).toISOString(); };
const forbidden = { ok: false, status: 403, error: 'Forbidden' };

// ── embargo ──────────────────────────────────────────────────
export async function getEmbargo(db, id) {
  const r = await db.prepare(`SELECT until_at, note FROM news_embargo WHERE news_id = ?`).bind(id).first().catch(() => null);
  return r ? { until: isoOf(r.until_at), note: r.note || '' } : null;
}

export { embargoBlock };

export async function setEmbargo(db, { id, until, note, actor, perms }) {
  if (!checkPermission(perms, 'news', 'schedule')) return forbidden;
  if (until === null || until === undefined || until === '') {
    await db.prepare(`DELETE FROM news_embargo WHERE news_id = ?`).bind(id).run();
    await logAudit(db, { userId: actor?.user_id ?? null, action: 'article_updated', entityType: 'news', entityId: id, metadata: { embargo: 'lifted' } });
    return { ok: true, embargo: null };
  }
  const t = Date.parse(String(until));
  if (Number.isNaN(t)) return { ok: false, status: 400, error: 'Choose a valid date and time' };
  if (t <= Date.now()) return { ok: false, status: 400, error: 'The embargo time must be in the future' };
  if (t > Date.now() + MAX_AHEAD_MS) return { ok: false, status: 400, error: 'The embargo is too far ahead (2 years at most)' };
  const text = String(note || '').replace(/<[^>]*>/g, '').trim().slice(0, 200) || null;
  await db.prepare(`INSERT INTO news_embargo (news_id, until_at, note, set_by) VALUES (?, ?, ?, ?)
    ON CONFLICT(news_id) DO UPDATE SET until_at = excluded.until_at, note = excluded.note, set_by = excluded.set_by, set_at = CURRENT_TIMESTAMP`)
    .bind(id, toSql(t), text, actor?.user_id ?? null).run();
  await logAudit(db, { userId: actor?.user_id ?? null, action: 'article_updated', entityType: 'news', entityId: id, metadata: { embargo: toSql(t) } });
  return { ok: true, embargo: { until: new Date(t).toISOString(), note: text || '' } };
}

// ── planned dates for drafts ─────────────────────────────────
// Only an UNPUBLISHED story can have a plan; planning never publishes or schedules anything.
export async function listPlanned(db, { fromMs, toMs, condition = '', params = [] }) {
  const access = condition ? ` AND (${condition})` : '';
  const r = await db.prepare(`
    SELECT n.id, n.slug, n.title, n.published, n.section_id, n.author_id, n.article_type, p.planned_at, e.workflow_status
    FROM news_plan p JOIN news n ON n.id = p.news_id LEFT JOIN news_editorial e ON e.news_id = n.id
    WHERE n.published = 0 AND datetime(p.planned_at) >= datetime(?) AND datetime(p.planned_at) < datetime(?)${access}
    ORDER BY datetime(p.planned_at), n.id LIMIT 300`).bind(toSql(fromMs), toSql(toMs), ...params).all();
  return (r.results || []).map((x) => ({ ...x, planned_iso: isoOf(x.planned_at), state: x.workflow_status || 'draft', planned: true }));
}

export async function setPlan(db, { id, at, actor, perms }) {
  if (!checkPermission(perms, 'news', 'update')) return forbidden;
  const row = await db.prepare(`SELECT id, published FROM news WHERE id = ?`).bind(id).first();
  if (!row) return { ok: false, status: 404, error: 'Article not found' };
  if (row.published === 1) return { ok: false, status: 409, error: 'Only a story that is not published or scheduled can be planned. Use Reschedule for scheduled stories.' };
  if (at === null || at === undefined || at === '') {
    await db.prepare(`DELETE FROM news_plan WHERE news_id = ?`).bind(id).run();
    return { ok: true, planned_at: null };
  }
  const t = Date.parse(String(at));
  if (Number.isNaN(t)) return { ok: false, status: 400, error: 'Choose a valid date and time' };
  if (t > Date.now() + MAX_AHEAD_MS) return { ok: false, status: 400, error: 'That date is too far ahead (2 years at most)' };
  await db.prepare(`INSERT INTO news_plan (news_id, planned_at, created_by) VALUES (?, ?, ?)
    ON CONFLICT(news_id) DO UPDATE SET planned_at = excluded.planned_at, updated_at = CURRENT_TIMESTAMP`).bind(id, toSql(t), actor?.user_id ?? null).run();
  await logAudit(db, { userId: actor?.user_id ?? null, action: 'article_updated', entityType: 'news', entityId: id, metadata: { planned_for: toSql(t) } });
  return { ok: true, planned_at: new Date(t).toISOString() };
}

// A new, EMPTY draft with a planned day. Nothing is published; the text is written later in the normal editor.
export async function createPlanned(db, { title, at, sectionId = null, actor, perms }) {
  if (!checkPermission(perms, 'news', 'create')) return forbidden;
  const name = String(title || '').replace(/<[^>]*>/g, '').trim().slice(0, 200);
  if (name.length < 3) return { ok: false, status: 400, error: 'Give the story a title (at least 3 characters)' };
  const t = at ? Date.parse(String(at)) : null;
  if (at && Number.isNaN(t)) return { ok: false, status: 400, error: 'Choose a valid date and time' };
  const slug = `${slugify(name).slice(0, 80) || 'story'}-${Date.now().toString(36)}`;
  const r = await createNews(db, { slug, title: name, content: '<p></p>', published: 0, author: 'Admin', created_by: actor?.user_id ?? null });
  const id = r?.meta?.last_row_id;
  if (!id) return { ok: false, status: 500, error: 'The story could not be created' };
  await db.prepare(`INSERT OR IGNORE INTO news_editorial (news_id) VALUES (?)`).bind(id).run();
  const sec = Number(sectionId);
  if (Number.isInteger(sec) && sec > 0) await db.prepare(`UPDATE news SET section_id = ? WHERE id = ? AND EXISTS (SELECT 1 FROM news_sections WHERE id = ? AND active = 1)`).bind(sec, id, sec).run();
  if (t !== null) await db.prepare(`INSERT INTO news_plan (news_id, planned_at, created_by) VALUES (?, ?, ?)`).bind(id, toSql(t), actor?.user_id ?? null).run();
  await logAudit(db, { userId: actor?.user_id ?? null, action: 'article_updated', entityType: 'news', entityId: id, metadata: { created_from: 'calendar' } });
  return { ok: true, id, slug };
}

// ── bulk topic add / remove ──────────────────────────────────
export async function setTopic(db, { id, topicId, remove = false, actor, perms }) {
  if (!checkPermission(perms, 'news', 'update')) return forbidden;
  const tid = Number(topicId);
  const topic = Number.isInteger(tid) ? await db.prepare(`SELECT id FROM news_topics WHERE id = ? AND active = 1`).bind(tid).first() : null;
  if (!topic) return { ok: false, status: 400, error: 'topic not found or inactive' };
  if (remove) await db.prepare(`DELETE FROM news_article_topics WHERE news_id = ? AND topic_id = ?`).bind(id, tid).run();
  else await db.prepare(`INSERT OR IGNORE INTO news_article_topics (news_id, topic_id) VALUES (?, ?)`).bind(id, tid).run();
  await db.prepare(`UPDATE news SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run();
  await logAudit(db, { userId: actor?.user_id ?? null, action: 'article_updated', entityType: 'news', entityId: id, metadata: { bulk: remove ? 'topic_removed' : 'topic_added', topic_id: tid } });
  return { ok: true };
}
