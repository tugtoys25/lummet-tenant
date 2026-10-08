// ============================================================
// en/worker/newsroom-stats.js  --  Stage G: most-read, trending, pins
//
// Reuses the EXISTING analytics tables (no new tracking):
//   * analytics_events  (PAGE_VIEW/CONTENT_VIEW rows carry news_id; bots and
//     duplicates excluded exactly like the daily aggregation does)
//   * analytics_daily   (dimension_type = 'news', written by the existing cron)
//
// Cost control: the ranking (ids + counts, ~50 rows) is cached in KV
// (env.CACHE) and recomputed at most once per TTL per key. The cached value is
// only a RANKING: articles are re-hydrated from `news` on every render with the
// live/published filter, so an article that is unpublished, scheduled or
// deleted after the ranking was cached can never appear.
//
// Sponsored, commercial and press-release content is never promoted in these
// lists. Every function fails soft (returns []) so a stats problem can never
// break a page.
// ============================================================

import { getCached, setCached } from './cache.js';

export const MOST_READ_WINDOWS = {
  '24h': { label: 'Last 24 hours', ttl: 600 },
  '7d': { label: 'Last 7 days', ttl: 3600 },
  '30d': { label: 'Last 30 days', ttl: 10800 }
};
const VIEW_TYPES = `('PAGE_VIEW','CONTENT_VIEW')`;                       // same set the daily aggregation counts
const LIVE = `n.published = 1 AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))`;
const NOT_PROMOTED = `COALESCE(n.content_class, 'editorial') NOT IN ('sponsored','commercial','press_release') AND COALESCE(n.article_type, 'news') != 'press_release'`;

export const CARD_COLUMNS = `n.id, n.slug, n.title, n.excerpt, n.published_at, n.created_at, n.article_type, n.content_class, n.labels, n.section_id,
       m.url AS featured_image_url, m.thumbnail_url AS featured_image_thumbnail, m.alt_text AS featured_image_alt,
       m.width AS featured_image_width, m.height AS featured_image_height, a.name AS author_name`;
const CARD_JOINS = `LEFT JOIN media_library m ON m.id = n.featured_image LEFT JOIN authors a ON a.id = n.author_id`;

// ── ranking queries (cached) ─────────────────────────────────
export async function rankMostRead(db, env, key) {
  const cfg = MOST_READ_WINDOWS[key];
  if (!cfg) return [];
  const ck = `news:mostread:${key}`;
  const hit = await getCached(env, ck);
  if (Array.isArray(hit)) return hit;

  let rows = [];
  try {
    const raw = (where, ...p) => db.prepare(`
      SELECT news_id, COUNT(*) AS views FROM analytics_events
      WHERE event_type IN ${VIEW_TYPES} AND news_id IS NOT NULL AND is_bot = 0 AND is_duplicate = 0 AND ${where}
      GROUP BY news_id ORDER BY views DESC LIMIT 50`).bind(...p).all();

    if (key === '24h') {
      rows = (await raw(`occurred_at >= datetime('now','-1 day')`)).results || [];
    } else {
      const days = key === '7d' ? 7 : 30;
      const has = await db.prepare(`SELECT 1 AS x FROM analytics_daily WHERE dimension_type = 'news' AND date >= date('now', ?) LIMIT 1`).bind(`-${days} day`).first();
      if (has) {
        // completed days from the daily rollup + today's partial day from raw events
        rows = (await db.prepare(`
          SELECT news_id, SUM(v) AS views FROM (
            SELECT dimension_id AS news_id, page_views AS v FROM analytics_daily
              WHERE dimension_type = 'news' AND date >= date('now', ?) AND date < date('now') AND dimension_id IS NOT NULL
            UNION ALL
            SELECT news_id, COUNT(*) AS v FROM analytics_events
              WHERE event_type IN ${VIEW_TYPES} AND news_id IS NOT NULL AND is_bot = 0 AND is_duplicate = 0 AND date(occurred_at) >= date('now')
              GROUP BY news_id
          ) GROUP BY news_id ORDER BY views DESC LIMIT 50`).bind(`-${days} day`).all()).results || [];
      } else {
        rows = (await raw(`occurred_at >= datetime('now', ?)`, `-${days} day`)).results || [];   // rollup cron not enabled: fall back to raw events
      }
    }
    rows = rows.filter((r) => r.news_id && r.views > 0).map((r) => ({ news_id: r.news_id, views: r.views }));
    await setCached(env, ck, rows, cfg.ttl);
  } catch (e) {
    console.error('most-read ranking failed:', key, e.message);
    return [];
  }
  return rows;
}

export async function rankRecentActivity(db, env) {
  const ck = 'news:trending:raw';
  const hit = await getCached(env, ck);
  if (Array.isArray(hit)) return hit;
  try {
    const rows = (await db.prepare(`
      SELECT news_id,
             SUM(CASE WHEN occurred_at >= datetime('now','-6 hours') THEN 1 ELSE 0 END) AS v6,
             COUNT(*) AS v24
      FROM analytics_events
      WHERE event_type IN ${VIEW_TYPES} AND news_id IS NOT NULL AND is_bot = 0 AND is_duplicate = 0
        AND occurred_at >= datetime('now','-1 day')
      GROUP BY news_id HAVING v6 > 0 ORDER BY v6 DESC LIMIT 60`).all()).results || [];
    await setCached(env, ck, rows, 600);
    return rows;
  } catch (e) {
    console.error('trending ranking failed:', e.message);
    return [];
  }
}

// score = recent views * (1 + positive growth) * recency decay.
//   v6      views in the last 6 hours
//   v24     views in the last 24 hours (includes v6)
//   growth  how far the last 6h beats the average 6h bucket of the prior 18h (capped at 5x)
//   decay   0.5 ^ (article age / 48h)
export function trendScore({ v6, v24, ageHours }) {
  const base = Math.max(0, v24 - v6) / 3;
  const growth = Math.min(5, Math.max(0, (v6 - base) / (base + 1)));
  const decay = Math.pow(0.5, Math.max(0, ageHours) / 48);
  return v6 * (1 + growth) * decay;
}

// ── hydration: live, promotable articles only ────────────────
export async function hydrateLive(db, ids, { promotedOnly = true } = {}) {
  const uniq = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  if (!uniq.length) return new Map();
  const ph = uniq.map(() => '?').join(',');
  const rows = (await db.prepare(`
    SELECT ${CARD_COLUMNS} FROM news n ${CARD_JOINS}
    WHERE n.id IN (${ph}) AND ${LIVE}${promotedOnly ? ` AND ${NOT_PROMOTED}` : ''}`).bind(...uniq).all()).results || [];
  return new Map(rows.map((r) => [r.id, r]));
}

export async function getMostRead(db, env, key, limit = 5) {
  try {
    const ranked = await rankMostRead(db, env, key);
    if (!ranked.length) return [];
    const map = await hydrateLive(db, ranked.map((r) => r.news_id));
    return ranked.filter((r) => map.has(r.news_id)).slice(0, limit).map((r) => ({ ...map.get(r.news_id), views: r.views }));
  } catch (e) { console.error('getMostRead failed:', e.message); return []; }
}

// ── pins (editor overrides) ──────────────────────────────────
export const PIN_SLOTS = ['lead', 'featured', 'trending'];
export async function getPinnedIds(db, slot) {
  const r = await db.prepare(`
    SELECT news_id FROM news_pins WHERE slot = ?
      AND (starts_at IS NULL OR datetime(starts_at) <= datetime('now'))
      AND (ends_at IS NULL OR datetime(ends_at) > datetime('now'))
    ORDER BY position, id LIMIT 20`).bind(slot).all();
  return (r.results || []).map((x) => x.news_id);
}

export async function getPinned(db, slot, { promotedOnly = false } = {}) {
  try {
    const ids = await getPinnedIds(db, slot);
    const map = await hydrateLive(db, ids, { promotedOnly });
    return ids.filter((i) => map.has(i)).map((i) => map.get(i));   // pins of unpublished/scheduled/deleted articles silently drop out
  } catch (e) { console.error('getPinned failed:', slot, e.message); return []; }
}

export async function getTrending(db, env, limit = 5, now = Date.now()) {
  try {
    const [pinned, activity] = await Promise.all([getPinned(db, 'trending', { promotedOnly: true }), rankRecentActivity(db, env)]);
    const map = await hydrateLive(db, activity.map((a) => a.news_id));
    const scored = activity.filter((a) => map.has(a.news_id)).map((a) => {
      const art = map.get(a.news_id);
      const t = Date.parse(String(art.published_at || art.created_at).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(art.published_at || art.created_at)) ? '' : 'Z'));
      const ageHours = Number.isNaN(t) ? 0 : (now - t) / 3600e3;
      return { art, score: trendScore({ v6: a.v6, v24: a.v24, ageHours }), ageHours };
    }).filter((s) => s.ageHours <= 14 * 24 && s.score > 0).sort((x, y) => y.score - x.score);
    const seen = new Set(pinned.map((p) => p.id));
    return [...pinned, ...scored.map((s) => s.art).filter((a) => !seen.has(a.id))].slice(0, limit);
  } catch (e) { console.error('getTrending failed:', e.message); return []; }
}

// Replaces the pins of one slot. Validation happens before any write.
export async function savePins(db, slot, items, { actor } = {}) {
  if (!PIN_SLOTS.includes(slot)) return { ok: false, status: 400, error: 'invalid slot' };
  if (!Array.isArray(items) || items.length > 10) return { ok: false, status: 400, error: 'items must be an array (max 10)' };
  const clean = [];
  const dateOk = (v) => v == null || v === '' || !Number.isNaN(Date.parse(String(v)));
  for (const [i, it] of items.entries()) {
    const id = Number(it?.news_id);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, status: 400, error: `item ${i + 1}: invalid news_id` };
    if (!dateOk(it.starts_at) || !dateOk(it.ends_at)) return { ok: false, status: 400, error: `item ${i + 1}: invalid date` };
    clean.push({ id, position: i, starts_at: it.starts_at ? new Date(it.starts_at).toISOString().slice(0, 19).replace('T', ' ') : null, ends_at: it.ends_at ? new Date(it.ends_at).toISOString().slice(0, 19).replace('T', ' ') : null });
  }
  if (clean.length) {
    const ph = [...new Set(clean.map((c) => c.id))];
    const r = await db.prepare(`SELECT COUNT(*) AS c FROM news WHERE id IN (${ph.map(() => '?').join(',')})`).bind(...ph).first();
    if (r.c !== ph.length) return { ok: false, status: 400, error: 'unknown article' };
  }
  await db.prepare(`DELETE FROM news_pins WHERE slot = ?`).bind(slot).run();
  for (const c of clean) {
    await db.prepare(`INSERT INTO news_pins (news_id, slot, position, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(c.id, slot, c.position, c.starts_at, c.ends_at, actor?.user_id ?? null).run();
  }
  return { ok: true, count: clean.length };
}
