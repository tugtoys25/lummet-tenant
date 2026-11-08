// Loads live banners for a request: query + 60s per-country cache, item references resolved to live data.
import { getLocal, setLocal, getCached, setCached } from "../cache.js";
import { listServable } from "../database/live-banners.js";
import { resolvePicks } from "../component-sources.js";
import { forCountry, forPage, casinoAllowed } from "./target.js";
import { TEMPLATES } from "./templates.js";

const VER_KEY = "public:live-banners:ver";
const TTL = 60;

/** Called after every admin write so the next render re-queries (new version = new cache keys). */
export async function clearLiveBannerCache(env) {
  try { await setCached(env, VER_KEY, String(Date.now()), 86400); } catch { /* best effort */ }
}

async function geoMap(db, slugs, country) {
  const map = new Map();
  if (!slugs.length) return map;
  const ph = slugs.map(() => "?").join(",");
  const { results } = await db.prepare(`SELECT casino_slug, country_code, status FROM geo_rules WHERE casino_slug IN (${ph})`).bind(...slugs).all();
  for (const r of results || []) { if (!map.has(r.casino_slug)) map.set(r.casino_slug, []); map.get(r.casino_slug).push(r); }
  const out = new Map();
  for (const s of slugs) out.set(s, casinoAllowed(map.get(s), country));
  return out;
}

/** Turn stored item references into the card models the templates draw. Missing/unpublished/blocked items are skipped. */
export async function resolveItems(db, banner, country, { geo = true } = {}) {
  const tpl = TEMPLATES[banner.template_key];
  const stored = banner.items || [];
  const cards = [];
  const refs = stored.filter((i) => i.source_type !== "slide");
  const live = await resolvePicks(db, refs.map((i) => ({ source: i.source_type, key: i.source_key })));
  const byKey = new Map(live.map((c) => [`${c.source}:${c.key}`, c]));
  const casinoSlugs = live.filter((c) => c.source === "casino").map((c) => c.key);
  const allowed = geo ? await geoMap(db, casinoSlugs, country) : null;
  for (const it of stored) {
    const ov = it.overrides || {};
    if (it.source_type === "slide") { cards.push({ source: "slide", key: it.source_key, title: ov.label || "", image: ov.image || "", url: ov.url || "", sponsored: false }); continue; }
    const c = byKey.get(`${it.source_type}:${it.source_key}`);
    if (!c) continue;
    if (c.source === "casino" && allowed && !allowed.get(c.key)) continue;
    cards.push({ ...c, title: ov.label || c.title, image: ov.image || c.image, badge: ov.badge || c.badge, url: ov.url || c.url });
  }
  return tpl ? cards.slice(0, tpl.maxItems || 0) : [];
}

/** Banners for this visitor: country filter + items resolved (cached 60s), then page filter. */
export async function loadLiveBanners(env, { country = null, pageType = "", slug = "", signedIn = false } = {}) {
  if (!env.DB) return [];
  const ver = (await getCached(env, VER_KEY)) || "0";
  const key = `public:live-banners:${ver}:${country || "XX"}`;
  let list = await getLocal(env, key);
  if (!list) {
    const all = forCountry(await listServable(env.DB), country);
    list = [];
    for (const b of all) {
      const resolved = await resolveItems(env.DB, b, country);
      const needs = (TEMPLATES[b.template_key]?.maxItems || 0) > 0;
      if (needs && !resolved.length) continue;
      list.push({ ...b, items: undefined, cards: resolved });
    }
    await setLocal(env, key, list, TTL);
  }
  return forPage(list, { pageType, slug, signedIn });
}
