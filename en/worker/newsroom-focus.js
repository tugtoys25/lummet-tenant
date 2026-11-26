// worker/newsroom-focus.js -- image focal point (switch news_image_focus, off by default).
// The point is kept in its own table (the media library table is untouched). It only changes WHICH part of a cropped picture
// stays in view (CSS object-position); the original file is never altered.
import { checkPermission } from './database/permissions.js';
import { logAudit } from './database/audit.js';

const clamp = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null; };

export async function getFocus(db, mediaId) {
  const r = await db.prepare(`SELECT x, y FROM media_focus WHERE media_id = ?`).bind(mediaId).first().catch(() => null);
  return r ? { x: r.x, y: r.y } : null;
}

export async function setFocus(db, { mediaId, x, y, actor, perms }) {
  if (!checkPermission(perms, 'media', 'create')) return { ok: false, status: 403, error: 'Forbidden' };
  const m = await db.prepare(`SELECT id FROM media_library WHERE id = ?`).bind(mediaId).first();
  if (!m) return { ok: false, status: 404, error: 'Image not found' };
  if (x === null || x === undefined || y === null || y === undefined) {
    await db.prepare(`DELETE FROM media_focus WHERE media_id = ?`).bind(mediaId).run();
    await logAudit(db, { userId: actor?.user_id ?? null, action: 'article_updated', entityType: 'media', entityId: mediaId, metadata: { focus: 'reset' } });
    return { ok: true, focus: null };
  }
  const fx = clamp(x), fy = clamp(y);
  if (fx === null || fy === null) return { ok: false, status: 400, error: 'Click on the picture to choose the focal point' };
  await db.prepare(`INSERT INTO media_focus (media_id, x, y) VALUES (?, ?, ?) ON CONFLICT(media_id) DO UPDATE SET x = excluded.x, y = excluded.y, updated_at = CURRENT_TIMESTAMP`).bind(mediaId, fx, fy).run();
  await logAudit(db, { userId: actor?.user_id ?? null, action: 'article_updated', entityType: 'media', entityId: mediaId, metadata: { focus: [fx, fy] } });
  return { ok: true, focus: { x: fx, y: fy } };
}

// Adds focus_x / focus_y to article rows that have a featured picture with a saved point. One query, never throws.
export async function attachFocus(db, rows) {
  try {
    const list = (rows || []).filter((r) => r && r.featured_image && r.focus_x === undefined);
    const ids = [...new Set(list.map((r) => Number(r.featured_image)).filter((n) => Number.isInteger(n) && n > 0))];
    if (!ids.length) return rows;
    const res = (await db.prepare(`SELECT media_id, x, y FROM media_focus WHERE media_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results || [];
    const by = new Map(res.map((r) => [r.media_id, r]));
    for (const r of list) { const f = by.get(Number(r.featured_image)); if (f) { r.focus_x = f.x; r.focus_y = f.y; } }
  } catch (e) { console.error('focus lookup failed:', e.message); }
  return rows;
}

// The CSS to append to an <img> style, or '' when there is no saved point.
export const focusCss = (r) => (r && Number.isInteger(r.focus_x) && Number.isInteger(r.focus_y) ? `object-position:${r.focus_x}% ${r.focus_y}%;` : '');
