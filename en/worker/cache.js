// =====================================================
// KV CACHE UTILITY
// Wraps Cloudflare KV with TTL + JSON serialization
// =====================================================

const DEFAULT_TTL = 300;       // 5 minutes
const LONG_TTL = 600;           // 10 minutes

// In-isolate (L1) layer in front of KV. A warm isolate answers repeated
// reads (settings, nav, ...) from memory instead of a KV round trip on
// every request. Entries live a few seconds, so a change made in another
// isolate shows up within L1_TTL_MS; invalidate() clears this isolate at
// once. Keyed per KV binding so tests / tenants never share entries.
const L1_TTL_MS = 15000;
const L1_MAX = 300;
const l1Stores = new WeakMap();

function l1(env) {
  const kv = env && env.CACHE;
  if (!kv || typeof kv !== "object") return null;
  let m = l1Stores.get(kv);
  if (!m) { m = new Map(); l1Stores.set(kv, m); }
  return m;
}

function l1Put(env, key, raw, ttlSeconds) {
  const m = l1(env);
  if (!m) return;
  if (m.size >= L1_MAX) m.delete(m.keys().next().value);
  m.set(key, { raw, exp: Date.now() + Math.min(L1_TTL_MS, ttlSeconds * 1000) });
}

/**
 * Get a cached JSON value, or null if miss/expired
 */
export async function getCached(env, key) {
  if (!env.CACHE) return null;
  try {
    const m = l1(env);
    const hit = m && m.get(key);
    if (hit) {
      if (hit.exp > Date.now()) return JSON.parse(hit.raw);
      m.delete(key);
    }
    const raw = await env.CACHE.get(key);
    if (!raw) return null;
    l1Put(env, key, raw, DEFAULT_TTL);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Store a JSON value in KV with TTL
 */
export async function setCached(env, key, value, ttl = DEFAULT_TTL) {
  if (!env.CACHE) return;
  try {
    const raw = JSON.stringify(value);
    await env.CACHE.put(key, raw, { expirationTtl: ttl });
    l1Put(env, key, raw, ttl);
  } catch (e) {
    console.error("KV put failed:", e.message);
  }
}

// -----------------------------------------------------
// LOCAL (per data centre) CACHE
// Cloudflare's Cache API: free and with no write limit, unlike KV (the free
// KV plan allows only 1,000 writes a day). Each data centre has its own copy,
// so use it only for things that may be a little old or that are retired by
// changing their key (the page cache). Falls back to KV where the Cache API
// does not exist (tests, workers.dev).
// -----------------------------------------------------
// Keys use the site's own domain: the Cache API belongs to a zone, so a made-up host may be ignored.
function localKey(env, key, origin) {
  if (!origin) {
    origin = "https://local-cache.invalid";
    try { if (env && env.SITE_URL) origin = new URL(env.SITE_URL).origin; } catch { /* keep default */ }
  }
  return new Request(`${origin}/__local-cache/${encodeURIComponent(key)}`);
}

// "unknown" until the first save has been read back. On a workers.dev address
// the Cache API accepts a save but never returns it; then this isolate falls
// back to KV instead of silently caching nothing.
let localState = "unknown";
let probeMisses = 0;

function localCache() {
  if (localState === "broken") return null;
  try { return typeof caches !== "undefined" && caches.default ? caches.default : null; }
  catch { return null; }
}

export function hasLocalCache() { return !!localCache(); }
export function _resetLocalState() { localState = "unknown"; probeMisses = 0; }

/** Like getLocal, but also says where the value came from: "cache", "kv" or "miss". */
export async function getLocalWithSource(env, key, origin) {
  const c = localCache();
  try {
    if (c) {
      const res = await c.match(localKey(env, key, origin));
      if (res) return { value: await res.json(), src: "cache" };
      if (localState === "ok" || !env.CACHE) return { value: null, src: "miss" };
      // not proven to work yet (or saved to KV while it was unproven): also look in KV
      const raw = await env.CACHE.get(key);
      return raw ? { value: JSON.parse(raw), src: "kv" } : { value: null, src: "miss" };
    }
    if (!env.CACHE) return { value: null, src: "miss" };
    const raw = await env.CACHE.get(key);
    return raw ? { value: JSON.parse(raw), src: "kv" } : { value: null, src: "miss" };
  } catch {
    return { value: null, src: "miss" };
  }
}

export async function getLocal(env, key, origin) {
  return (await getLocalWithSource(env, key, origin)).value;
}

/** Returns "cache", "kv:no-cache-api", "kv:probe-failed(host)" or "failed" so callers can report where it went. */
export async function setLocal(env, key, value, ttl = DEFAULT_TTL, origin) {
  const c = localCache();
  try {
    const raw = JSON.stringify(value);
    if (c) {
      const req = localKey(env, key, origin);
      await c.put(req, new Response(raw, { headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttl}` } }));
      if (localState !== "ok") {
        // The read-back may run before the data centre has committed the save,
        // so look up to three times (now, +100 ms, +300 ms) before deciding.
        let seen = !!(await c.match(req));
        for (const wait of [100, 200]) {
          if (seen) break;
          await new Promise((r) => setTimeout(r, wait));
          seen = !!(await c.match(req));
        }
        if (seen) { localState = "ok"; probeMisses = 0; }
        else {
          probeMisses++;
          if (probeMisses >= 2) localState = "broken";
          if (env.CACHE) {
            await env.CACHE.put(key, raw, { expirationTtl: Math.max(60, ttl) });
            return `kv:probe-failed(${new URL(req.url).host})`;
          }
          return "failed";
        }
      }
      return "cache";
    }
    if (!env.CACHE) return "failed";
    await env.CACHE.put(key, raw, { expirationTtl: Math.max(60, ttl) });
    return "kv:no-cache-api";
  } catch (e) {
    console.error("local cache put failed:", e.message);
    return "failed";
  }
}

/**
 * Delete one or more cached keys
 */
export async function invalidate(env, keys) {
  if (!env.CACHE) return;
  const keyArray = Array.isArray(keys) ? keys : [keys];
  const m = l1(env);
  if (m) keyArray.forEach(k => m.delete(k));
  await Promise.all(
    keyArray.map(k => env.CACHE.delete(k).catch(() => {}))
  );
}

// =====================================================
// CACHE KEYS — Centralized to avoid typos
// =====================================================

export const CACHE_KEYS = {
  // Public sidebar / homepage data
  PUBLIC_CASINOS:    "public:casinos:all",
  PUBLIC_GEO_RULES:  "public:geo_rules:all",
  PUBLIC_NEWS:       "public:news:latest",
  PUBLIC_COUNTRIES:  "public:countries:all",
  PUBLIC_CATEGORIES: "public:categories:all",

  SITE_SETTINGS: (hostname) =>
  `site-settings:${String(hostname || "").toLowerCase()}`,

  // Full rendered homepage HTML, per tenant hostname + visitor country
  // (casino availability/geo-blocking means the page isn't identical
  // across countries, so it can't share one cache entry).
  PAGE_HOME: (hostname, country) =>
    `page:home:${String(hostname || "").toLowerCase()}:${country || "XX"}`,

  // Navigation (per location)
  NAV: (location) => `nav:${location}`,

  // All nav locations for bulk invalidation
  // NOTE: "page" added for PageNav (migration 0017_page_nav_geo.sql).
  // This is a cache-key bookkeeping change only — no PageNav
  // rendering or cache-read logic is implemented yet.
  NAV_ALL_LOCATIONS: ["nav:header", "nav:footer_casinos", "nav:footer_company", "nav:footer_support", "nav:footer_legal", "nav:mobile", "nav:page"],
 // NAV_ALL_LOCATIONS: ["nav:header", "nav:footer_casinos", "nav:footer_company", "nav:footer_support", "nav:footer_legal"],
};

// =====================================================
// INVALIDATION HELPERS — Call after admin mutations
// =====================================================

export async function invalidateCasinos(env) {
  await invalidate(env, [CACHE_KEYS.PUBLIC_CASINOS, CACHE_KEYS.PUBLIC_GEO_RULES]);
}

export async function invalidateNews(env) {
  await invalidate(env, [CACHE_KEYS.PUBLIC_NEWS]);
}

export async function invalidateCountries(env) {
  await invalidate(env, [CACHE_KEYS.PUBLIC_COUNTRIES]);
}

export async function invalidateCategories(env) {
  await invalidate(env, [CACHE_KEYS.PUBLIC_CATEGORIES]);
}

export async function invalidateNav(env) {
  await invalidate(env, CACHE_KEYS.NAV_ALL_LOCATIONS);
}


// =====================================================
// FULL-PAGE CACHE (stale-while-revalidate)
// =====================================================
// Caches an entire rendered page's HTML, not just the data that
// feeds it. On a hit, the page is served straight out of KV with
// zero D1 reads. Once it's older than FRESH_SECONDS it's still
// served immediately (stale), while a single background request
// re-renders and refreshes it via ctx.waitUntil -- visitors never
// wait on D1, and D1 only gets hit once per FRESH_SECONDS window
// per (page, country), not once per request.

export const PAGE_CACHE = {
  FRESH_SECONDS: 60,   // serve straight from cache, no regen, within this window
  KV_TTL: 3600,        // how long a stale copy stays servable/regenerable before it's gone
  LOCK_TTL: 20,         // background-regen lock -- avoids duplicate concurrent regenerations
};

export async function getCachedPage(env, key) {
  if (!env.CACHE) return null;
  try {
    const raw = await env.CACHE.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setCachedPage(env, key, html) {
  if (!env.CACHE) return;
  try {
    await env.CACHE.put(
      key,
      JSON.stringify({ html, generatedAt: Date.now() }),
      { expirationTtl: PAGE_CACHE.KV_TTL }
    );
  } catch (e) {
    console.error("Page cache put failed:", e.message);
  }
}

// Best-effort lock so a stampede of visitors hitting a stale page
// doesn't all trigger their own background regeneration at once.
// If the lock write itself fails (e.g. KV also over quota), we just
// let regeneration proceed uncoordinated -- a duplicate render is
// harmless, unlike blocking the page.
export async function tryAcquireRegenLock(env, key) {
  if (!env.CACHE) return true;
  const lockKey = `lock:${key}`;
  try {
    const existing = await env.CACHE.get(lockKey);
    if (existing) return false;
    await env.CACHE.put(lockKey, "1", { expirationTtl: PAGE_CACHE.LOCK_TTL });
    return true;
  } catch {
    return true;
  }
}

export async function deleteCached(
  env,
  key
) {
  const cache =
    env?.CACHE;

  if (!cache) {
    return false;
  }

  await cache.delete(key);

  return true;
}
