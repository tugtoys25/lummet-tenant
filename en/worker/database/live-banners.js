// Live banners: D1 access. JSON columns are stored as text and parsed on read.
const JSON_COLS = ["width_json", "height_json", "style_json", "motion_json", "trigger_json", "frequency_json", "targeting_json", "content_json"];
const COLS = ["name", "status", "template_key", "placement_mode", "anchor", "offset_x", "offset_y", "z_tier", "priority", ...JSON_COLS, "dismissible", "start_at", "end_at"];

function parseRow(r) {
  if (!r) return null;
  const out = { ...r };
  for (const c of JSON_COLS) { try { out[c.slice(0, -5)] = JSON.parse(r[c] || "{}"); } catch { out[c.slice(0, -5)] = {}; } delete out[c]; }
  out.dismissible = !!r.dismissible;
  return out;
}

const bindVals = (b) => COLS.map((c) => {
  if (JSON_COLS.includes(c)) return JSON.stringify(b[c.slice(0, -5)] || {});
  if (c === "dismissible") return b.dismissible ? 1 : 0;
  return b[c] ?? null;
});

export async function listBanners(db) {
  const { results } = await db.prepare(`SELECT b.*, COALESCE(SUM(s.views),0) AS views, COALESCE(SUM(s.clicks),0) AS clicks
    FROM live_banners b LEFT JOIN live_banner_stats s ON s.banner_id = b.id GROUP BY b.id ORDER BY b.priority ASC, b.id ASC`).all();
  return (results || []).map((r) => ({ ...parseRow(r), views: r.views, clicks: r.clicks }));
}

export async function getBanner(db, id) {
  const row = await db.prepare("SELECT * FROM live_banners WHERE id = ?").bind(id).first();
  if (!row) return null;
  const items = await getItems(db, id);
  return { ...parseRow(row), items };
}

export async function getItems(db, bannerId) {
  const { results } = await db.prepare("SELECT source_type, source_key, overrides_json FROM live_banner_items WHERE banner_id = ? ORDER BY position ASC, id ASC").bind(bannerId).all();
  return (results || []).map((r) => { let o = {}; try { o = JSON.parse(r.overrides_json || "{}"); } catch { /* keep {} */ } return { source_type: r.source_type, source_key: r.source_key, overrides: o }; });
}

async function writeItems(db, id, items) {
  await db.prepare("DELETE FROM live_banner_items WHERE banner_id = ?").bind(id).run();
  let pos = 0;
  for (const it of items || []) {
    await db.prepare("INSERT INTO live_banner_items (banner_id, position, source_type, source_key, overrides_json) VALUES (?, ?, ?, ?, ?)")
      .bind(id, pos++, it.source_type, it.source_key, JSON.stringify(it.overrides || {})).run();
  }
}

export async function createBanner(db, banner, items, userId = null) {
  const res = await db.prepare(`INSERT INTO live_banners (${COLS.join(",")}, created_by) VALUES (${COLS.map(() => "?").join(",")}, ?)`).bind(...bindVals(banner), userId).run();
  const id = res.meta.last_row_id;
  await writeItems(db, id, items);
  return id;
}

export async function updateBanner(db, id, banner, items) {
  await db.prepare(`UPDATE live_banners SET ${COLS.map((c) => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`).bind(...bindVals(banner), id).run();
  await writeItems(db, id, items);
}

export async function setStatus(db, id, status) {
  await db.prepare("UPDATE live_banners SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
}

export async function deleteBanner(db, id) {
  await db.prepare("DELETE FROM live_banner_stats WHERE banner_id = ?").bind(id).run();
  await db.prepare("DELETE FROM live_banners WHERE id = ?").bind(id).run();
}

export async function reorder(db, ids) {
  let p = 10;
  for (const id of ids) { await db.prepare("UPDATE live_banners SET priority = ?, updated_at = datetime('now') WHERE id = ?").bind(p, id).run(); p += 10; }
}

export async function countLive(db) {
  const r = await db.prepare("SELECT COUNT(*) AS c FROM live_banners WHERE status = 'live'").first();
  return Number(r?.c || 0);
}

/** Banners that could be shown right now (status live, inside the schedule). Country/page filtering happens in target.js. */
export async function listServable(db) {
  const { results } = await db.prepare(`SELECT * FROM live_banners WHERE status = 'live'
    AND (start_at IS NULL OR start_at = '' OR datetime(start_at) <= datetime('now'))
    AND (end_at IS NULL OR end_at = '' OR datetime(end_at) >= datetime('now'))
    ORDER BY priority ASC, id ASC`).all();
  const out = [];
  for (const r of results || []) out.push({ ...parseRow(r), items: await getItems(db, r.id) });
  return out;
}

export async function liveIds(db) {
  const { results } = await db.prepare("SELECT id FROM live_banners WHERE status = 'live'").all();
  return (results || []).map((r) => r.id);
}

export async function addStats(db, id, day, views, clicks) {
  await db.prepare(`INSERT INTO live_banner_stats (banner_id, day, views, clicks) VALUES (?, ?, ?, ?)
    ON CONFLICT(banner_id, day) DO UPDATE SET views = views + excluded.views, clicks = clicks + excluded.clicks`).bind(id, day, views, clicks).run();
}
