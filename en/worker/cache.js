// =====================================================
// KV CACHE UTILITY
// Wraps Cloudflare KV with TTL + JSON serialization
// =====================================================

const DEFAULT_TTL = 300;       // 5 minutes
const LONG_TTL = 600;           // 10 minutes

/**
 * Get a cached JSON value, or null if miss/expired
 */
export async function getCached(env, key) {
  if (!env.CACHE) return null;
  try {
    const raw = await env.CACHE.get(key);
    if (!raw) return null;
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
    await env.CACHE.put(key, JSON.stringify(value), { expirationTtl: ttl });
  } catch (e) {
    console.error("KV put failed:", e.message);
  }
}

/**
 * Delete one or more cached keys
 */
export async function invalidate(env, keys) {
  if (!env.CACHE) return;
  const keyArray = Array.isArray(keys) ? keys : [keys];
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
