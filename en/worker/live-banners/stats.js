// Public view/click beacon: strict validation, per-client rate limit, aggregated upserts (never a row per impression).
import { liveIds, addStats } from "../database/live-banners.js";

const WINDOW_MS = 60_000, MAX_PER_WINDOW = 60, MAX_BATCH = 20;
const buckets = new Map();

/** Per-isolate sliding window. Best effort: it protects D1 from a single client, it is not an accounting system. */
export function rateLimited(key, now = Date.now()) {
  const hits = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > WINDOW_MS) buckets.delete(k);
  return hits.length > MAX_PER_WINDOW;
}
export const _resetRate = () => buckets.clear();

/** body: { id, type } or { events: [{id, type}] }. Returns { status, accepted }. Never echoes input. */
export async function recordEvents(env, body, { clientKey = "anon", now = new Date() } = {}) {
  if (rateLimited(clientKey, now.getTime())) return { status: 429, accepted: 0 };
  const raw = Array.isArray(body?.events) ? body.events : body && typeof body === "object" ? [body] : [];
  if (!raw.length || raw.length > MAX_BATCH) return { status: 400, accepted: 0 };
  const sums = new Map();
  for (const e of raw) {
    const id = Number(e?.id);
    if (!Number.isInteger(id) || id < 1 || (e?.type !== "view" && e?.type !== "click")) return { status: 400, accepted: 0 };
    const s = sums.get(id) || { v: 0, c: 0 };
    if (e.type === "view") s.v++; else s.c++;
    sums.set(id, s);
  }
  const valid = new Set(await liveIds(env.DB));
  const day = now.toISOString().slice(0, 10);
  let accepted = 0;
  for (const [id, s] of sums) if (valid.has(id)) { await addStats(env.DB, id, day, s.v, s.c); accepted += s.v + s.c; }
  return { status: accepted ? 200 : 404, accepted };
}
