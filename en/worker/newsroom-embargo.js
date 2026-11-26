// worker/newsroom-embargo.js -- the one check every publishing path calls. No imports: safe to use anywhere.
// null = free to publish at `atMs`; otherwise a ready-made failure result. Never throws (a missing table means no embargo).
const parseDb = (v) => { const s = String(v || ''); const t = Date.parse(s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')); return Number.isNaN(t) ? null : t; };
export async function embargoBlock(db, id, atMs = Date.now()) {
  let e = null;
  try { e = await db.prepare(`SELECT until_at FROM news_embargo WHERE news_id = ?`).bind(id).first(); } catch { return null; }
  const until = e ? parseDb(e.until_at) : null;
  if (until === null || until <= atMs) return null;
  return { ok: false, status: 409, error: `This story is embargoed until ${new Date(until).toISOString().slice(0, 16).replace('T', ' ')} UTC. Change or lift the embargo first.` };
}
