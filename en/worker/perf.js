// Speed check support: record a sample of public page timings and summarise them.
// Recording is best effort: it never delays or fails a page, and does nothing
// until migration 0065 has been applied.
import { ASSET_VERSION } from "./asset-version.js";

export const SAMPLE_RATE = 0.1;
const KEEP_DAYS = 14;

export function pageState(response) {
  const s = response && response.headers && response.headers.get("x-page-cache");
  return s === "hit" || s === "stale" ? s : "miss";
}

export function shouldSample(rand = Math.random()) {
  return rand < SAMPLE_RATE;
}

export function recordSample(env, ctx, request, routeType, response, ms, rand = Math.random()) {
  try {
    if (!env.DB || !ctx || typeof ctx.waitUntil !== "function") return;
    if (!response || response.status !== 200 || !shouldSample(rand)) return;
    const path = new URL(request.url).pathname.slice(0, 200);
    const country = request.cf?.country || null;
    const work = (async () => {
      await env.DB.prepare(
        "INSERT INTO perf_samples (path, route, state, ms, status, country) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(path, routeType, pageState(response), Math.max(0, Math.round(ms)), response.status, country).run();
      if (rand < SAMPLE_RATE * 0.05) {
        await env.DB.prepare("DELETE FROM perf_samples WHERE at < datetime('now', ?)")
          .bind(`-${KEEP_DAYS} days`).run();
      }
    })().catch(() => {});
    ctx.waitUntil(work);
  } catch { /* never affect the page */ }
}

export function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1));
  return sortedAsc[i];
}

function stats(values) {
  const v = values.slice().sort((a, b) => a - b);
  return { n: v.length, p50: percentile(v, 50), p95: percentile(v, 95) };
}

export async function speedSummary(env, days = 7) {
  const base = { asset_version: ASSET_VERSION, days, sample_rate: SAMPLE_RATE };
  let rows;
  try {
    const res = await env.DB.prepare(
      "SELECT path, state, ms FROM perf_samples WHERE at >= datetime('now', ?) ORDER BY id DESC LIMIT 5000"
    ).bind(`-${days} days`).all();
    rows = res.results || [];
  } catch {
    return { ...base, available: false, hint: "Apply migration 0065_perf_samples.sql to start collecting samples." };
  }

  const by = { hit: [], stale: [], miss: [] };
  const paths = new Map();
  for (const r of rows) {
    (by[r.state] || by.miss).push(r.ms);
    if (!paths.has(r.path)) paths.set(r.path, []);
    paths.get(r.path).push(r.ms);
  }
  const total = rows.length;
  const served = by.hit.length + by.stale.length;
  const slowest = [...paths.entries()]
    .filter(([, v]) => v.length >= 3)
    .map(([path, v]) => ({ path, ...stats(v) }))
    .sort((a, b) => b.p95 - a.p95)
    .slice(0, 10);

  return {
    ...base,
    available: true,
    samples: total,
    cache_hit_rate: total ? Math.round((served / total) * 1000) / 10 : null,
    hit: stats(by.hit), stale: stats(by.stale), miss: stats(by.miss),
    slowest,
  };
}
