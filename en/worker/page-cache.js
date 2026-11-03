// =====================================================
// PUBLIC PAGE CACHE (stale-while-revalidate, per country)
// =====================================================
// Serves a whole rendered public page from the data centre's own cache (the
// Cache API: free, no write limit; KV only where that does not exist), so
// most visits cost one cache read instead of ~15 D1 queries. Safe because:
//  - only anonymous GET requests with no query string are cached, only 200s;
//  - the view events a page fires (CASINO_VIEW, OFFER_VIEW, ...) are recorded
//    when it is rendered and replayed, with the visitor's own country, city
//    and referrer, on every hit -- so analytics keep counting every view;
//  - a page that fires anything unusual (extra fields) is never cached;
//  - any successful admin save bumps an epoch. A page stored before the bump is still handed to an
//    anonymous visitor at once (marked "stale") while a fresh copy is rendered in the background, so nobody
//    waits for a cold render after an admin edit. A signed-in visitor, or PAGE_CACHE_STRICT=1, gets a fresh
//    render instead (see bumpPageEpoch);
//  - campaign links (?utm_source=..., ?fbclid=..., ?gclid=...) share the cached page of the plain address.
import { getCached, setCached, getLocalWithSource, setLocal, deleteLocal } from "./cache.js";
import { eventCapture, logEvent } from "./database/analytics.js";
import { geoEngine } from "./geo.js";
import { versionAssetUrls } from "./static-assets.js";
import { ASSET_VERSION } from "./asset-version.js";

export const PAGE_CACHE_CFG = {
  FRESH_SECONDS: 1800, // serve without refreshing inside this window (admin saves retire pages at once anyway)
  KV_TTL: 86400,       // (cache lifetime) a stale copy is served instantly (and refreshed) for up to a day,
                       // so a quiet site's visitors never wait for a cold render
  LOCK_SECONDS: 30,
  NOT_FOUND_SECONDS: 60, // a "page not found" is reused this long, then rendered again (a page published meanwhile appears)
};

const CACHEABLE = new Set([
  "home", "casino", "casinoList", "review", "reviewList", "news", "newsList",
  "category", "categoryList", "country", "countryList", "categoryCountryPage", "countryCustomPage",
  "sportsbook", "sportsbookReview", "sportsbookList",
  "affiliatePartner", "affiliatePartnerReview", "affiliatePartnerList",
  "custom", "customList", "customReview", "comparison", "comparisonList",
  "author", "authorList", "update", "updatesList", "page",
  "paymentMethod", "paymentMethodList", "researchHub", "researchTypeList", "researchItem",
  "contentLandingPage",
]);

// event fields a replay is allowed to carry; anything else => do not cache
const EVENT_FIELDS = new Set([
  "eventType", "casinoId", "reviewId", "pageId", "newsId", "offerId", "contentItemId",
  "countryCode", "city", "referrer", "landingPage", "metadata",
]);

// BANNER_VIEW carries { componentId, componentName, pageType, pageSlug }: the same for every
// visitor, so safe to replay. Anything bigger or nested is not.
function plainMetadata(m) {
  if (m == null) return true;
  if (typeof m !== "object" || Array.isArray(m)) return false;
  let size = 0;
  for (const v of Object.values(m)) {
    if (v != null && typeof v === "object") return false;
    size += String(v ?? "").length;
  }
  return size <= 1000;
}

// first path segment after /api/v1/ that visitors write to (never content)
const VISITOR_API = new Set([
  "auth", "newsletter", "user", "analytics", "ai", "ai-studio", "public",
  "stats", "report", "reports", "search", "setup",
]);

const EPOCH_KEY = "pc:epoch";

// Query parameters that only say where a visitor came from. No page changes with them, so they must neither stop a page
// from being cached nor make a copy of it (a campaign visitor used to wait for a full render on every single visit).
const TRACKING_PARAM = /^(?:utm_[a-z0-9_]+|gclid|gbraid|wbraid|dclid|gad_source|fbclid|msclkid|ttclid|twclid|yclid|igshid|li_fat_id|mc_cid|mc_eid|_ga|_gl|srsltid|epik)$/i;

/** "" or "?partial=1" when the query string allows caching (tracking parameters ignored), else null. */
export function cacheSearch(url) {
  let partial = false;
  for (const [k, v] of url.searchParams) {
    if (TRACKING_PARAM.test(k)) continue;
    if (k === "partial" && v === "1" && !partial) { partial = true; continue; }
    return null;
  }
  return partial ? "?partial=1" : "";
}

export function isCacheableRequest(request, routeType) {
  if (request.method !== "GET") return false;
  if (!CACHEABLE.has(routeType)) return false;
  let url;
  try { url = new URL(request.url); } catch { return false; }
  if (url.hostname.startsWith("lummet.")) return false;
  return cacheSearch(url) !== null;
}

export function isContentWrite(request, status) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return false;
  if (status < 200 || status >= 300) return false;
  let path;
  try { path = new URL(request.url).pathname; } catch { return false; }
  const m = path.match(/^\/(?:en\/)?api\/v1\/([^/]+)/);
  return !!m && !VISITOR_API.has(m[1]);
}

export async function bumpPageEpoch(env) {
  if (!env.CACHE) return;
  try {
    // this isolate sees it at once; others within the short in-memory window
    const e = String(Date.now());
    await setCached(env, EPOCH_KEY, e, 86400);
    const m = mem(env);
    if (m) { m.epoch = e; m.epochExp = Date.now() + MEM_EPOCH_MS; m.missing.clear(); }
  } catch (e) {
    console.error("page epoch bump failed:", e.message);
  }
}

// In-isolate memory (per KV binding, so tests and tenants never share it).
// Epoch: re-read at most every 30 s per isolate; the isolate that handles an admin save
// sees it at once. Pages: a rendered page is kept for a few minutes, so a warm isolate answers
// without any KV read (each copy carries the epoch it was rendered in, so a retired page is recognised here too).
const MEM_EPOCH_MS = 30000;
const MEM_PAGE_MS = 300000;
const MEM_PAGE_MAX = 30;
const memories = new WeakMap();

function mem(env) {
  const kv = env && env.CACHE;
  if (!kv || typeof kv !== "object") return null;
  let m = memories.get(kv);
  if (!m) { m = { epoch: null, epochExp: 0, pages: new Map(), missing: new Map(), origin: null }; memories.set(kv, m); }
  return m;
}

async function epoch(env) {
  const m = mem(env);
  if (m && m.epoch !== null && m.epochExp > Date.now()) return m.epoch;
  const v = await getCached(env, EPOCH_KEY);
  const e = v ? String(v) : "0";
  if (m) { m.epoch = e; m.epochExp = Date.now() + MEM_EPOCH_MS; }
  return e;
}

// The epoch this isolate last saw, without waiting for a KV read (null if none yet).
function epochNow(env) {
  const m = mem(env);
  return m && m.epoch !== null ? m.epoch : null;
}

/** Test hook: forget what this isolate holds in memory for a KV binding. */
export function _clearPageMemory(env) {
  const m = mem(env);
  if (m) { m.epoch = null; m.epochExp = 0; m.pages.clear(); m.missing.clear(); m.origin = null; }
}

const MEM_MISSING_MAX = 20;
function memPut(env, key, entry) {
  const m = mem(env);
  if (!m) return;
  // "not found" pages live in their own small map, so a crawler asking for random addresses can never push real pages out
  const isMissing = entry && entry.status === 404;
  const map = isMissing ? m.missing : m.pages;
  if (map.size >= (isMissing ? MEM_MISSING_MAX : MEM_PAGE_MAX)) map.delete(map.keys().next().value);
  (isMissing ? m.pages : m.missing).delete(key); // a key lives in one map only: the newer copy must not be shadowed by an older one
  map.set(key, { entry, exp: Date.now() + (isMissing ? PAGE_CACHE_CFG.NOT_FOUND_SECONDS * 1000 : MEM_PAGE_MS) });
}

// The scheduled warm-up has no request, and SITE_URL is not always set: remember the
// site's origin from live traffic (one KV write, repeated only if it changes or after 30 days).
const ORIGIN_KEY = "pc:origin";
function rememberOrigin(env, ctx, origin) {
  const m = mem(env);
  if (!m || m.origin === origin || !ctx || typeof ctx.waitUntil !== "function") return;
  m.origin = origin;
  ctx.waitUntil((async () => {
    try { if ((await getCached(env, ORIGIN_KEY)) !== origin) await setCached(env, ORIGIN_KEY, origin, 2592000); }
    catch { /* best effort */ }
  })());
}

function visitorGeo(request) {
  const edge = { country: request.cf?.country || null, city: request.cf?.city || "Unknown" };
  const g = geoEngine.process(request, edge);
  return { country: g.country || null, city: g.city || "Unknown" };
}

function replayEvents(request, env, ctx, events) {
  if (!events || !events.length || !ctx || typeof ctx.waitUntil !== "function") return;
  const geo = visitorGeo(request);
  for (const e of events) {
    ctx.waitUntil(
      logEvent(env.DB, {
        ...e,
        countryCode: geo.country,
        city: geo.city,
        referrer: request.headers.get("referer") || null,
      }).catch(() => {})
    );
  }
}

// Name of the first thing that makes a set of events unsafe to replay, or null.
function badEventField(events) {
  for (const e of events) {
    for (const k of Object.keys(e)) {
      if (e[k] === undefined || e[k] === null) continue;
      if (!EVENT_FIELDS.has(k)) return k;
      if (k === "metadata" && !plainMetadata(e[k])) return "metadata";
    }
  }
  return null;
}

function cleanEvents(events) { return badEventField(events) ? null : events; }

// Why a rendered response is not cached (shown in x-page-cache), or null if it can be.
function skipReason(response, events) {
  if (!response || (response.status !== 200 && response.status !== 404)) return "skip:status";
  const type = response.headers.get("content-type") || "";
  if (!/text\/html|application\/json/.test(type)) return "skip:type";
  if (response.status === 404 && !/text\/html/.test(type)) return "skip:type";
  const bad = badEventField(events);
  return bad ? `skip:event-field-${bad}` : null;
}

// Renders once, recording the view events it fires. `suppress` = background
// refresh: record them but do not write them (the visitor's own event was
// already written, or is replayed from the stored copy).
async function renderCaptured(render, suppress) {
  const pending = [];
  const fakeCtx = suppress ? { waitUntil: (p) => { pending.push(p); } } : null;
  const store = { events: [], suppress };
  const run = () => render(fakeCtx);
  const response = eventCapture ? await eventCapture.run(store, run) : null;
  if (suppress && pending.length) await Promise.allSettled(pending);
  return { response, events: store.events };
}

function toEntry(response, html, events, ep) {
  if (!response || (response.status !== 200 && response.status !== 404)) return null;
  const type = response.headers.get("content-type") || "";
  if (!/text\/html|application\/json/.test(type)) return null;
  const clean = cleanEvents(events);
  if (!clean) return null;
  return {
    // stored with its ?v=<hash> asset URLs already in place, so a hit is not re-scanned
    html: /text\/html/.test(type) ? versionAssetUrls(html) : html,
    av: ASSET_VERSION,
    epoch: ep,
    status: response.status,
    type,
    cc: response.headers.get("cache-control") || "",
    events: clean, generatedAt: Date.now(),
  };
}

function fromEntry(entry, state, src) {
  const headers = { "content-type": entry.type, "x-page-cache": state, "x-page-store": pageStore.last, "x-page-source": src };
  if (entry.cc) headers["cache-control"] = entry.cc;
  // finalizeResponse() (static-assets.js) skips its ?v= rewrite when this matches the running deploy
  if (entry.av && entry.av === ASSET_VERSION) headers["x-assets-versioned"] = entry.av;
  return new Response(entry.html, { status: entry.status === 404 ? 404 : 200, headers });
}

// A stored page is usable if it is readable and (for a "not found" copy) young. Whether an admin save has happened since
// it was rendered is a separate question (retired(), below): such a page is still served to anonymous visitors, as "stale".
function entryValid(entry) {
  if (!entry || typeof entry.html !== "string") return false;
  // a "not found" copy is short-lived: never served stale, so a page published since shows up within a minute
  if (entry.status === 404 && Date.now() - entry.generatedAt > PAGE_CACHE_CFG.NOT_FOUND_SECONDS * 1000) return false;
  return true;
}

function retired(entry, ep) { return String(entry.epoch ?? "0") !== String(ep); }

// A "not found" page cannot be shown stale after a save (the page may exist now): it counts as missing once retired.
function usable(entry, ep) { return entryValid(entry) && !(entry.status === 404 && retired(entry, ep)); }

// A signed-in visitor (admin or member) must see the page as it is now, not a copy from before an admin edit.
function hasSession(request) {
  return /(?:^|;\s*)session=/.test(request.headers.get("cookie") || "");
}

// The page is gone or moved: an older saved copy of it must not be served again.
const GONE = new Set([301, 302, 303, 307, 308, 410]);
function forget(env, key) { const m = mem(env); if (m) { m.pages.delete(key); m.missing.delete(key); } }

// What the last save in this isolate did: "cache", "kv", "failed" or "none".
// Shown on every cached response as x-page-store, so a broken save is visible.
export const pageStore = { last: "none" };

async function store(env, key, entry, origin) {
  memPut(env, key, entry);
  if (entry.status === 404) {
    // Only Cloudflare's cache (no write limit) holds these, never KV: a crawler asking for random
    // addresses would use up the free plan's 1,000 KV writes a day. Without it they stay in memory only.
    const r = await setLocal(env, key, entry, 120, origin, { kv: false });
    if (r !== "skipped") pageStore.last = r;
    else await deleteLocal(env, key, origin); // nowhere to keep the 404: do not leave the older page of this address behind
    return;
  }
  pageStore.last = await setLocal(env, key, entry, PAGE_CACHE_CFG.KV_TTL, origin);
}

// Refreshes are de-duplicated per isolate in memory (no KV write); an occasional
// duplicate refresh in another isolate is harmless.
const refreshing = new Map();

async function refresh(request, env, key, render, ep) {
  if (pageStore.last === "failed") return; // saves are being refused: do not re-render for nothing
  const until = refreshing.get(key);
  if (until && until > Date.now()) return;
  refreshing.set(key, Date.now() + PAGE_CACHE_CFG.LOCK_SECONDS * 1000);
  if (refreshing.size > 500) refreshing.delete(refreshing.keys().next().value);
  try {
    const { response, events } = await renderCaptured(render, true);
    if (!response) return;
    if (GONE.has(response.status)) { forget(env, key); await deleteLocal(env, key, new URL(request.url).origin); return; }
    const html = await response.clone().text();
    const entry = toEntry(response, html, events, ep ?? (await epoch(env)));
    if (entry) await store(env, key, entry, new URL(request.url).origin);
  } catch (e) {
    console.error("page cache refresh failed:", e.message);
  }
}

/**
 * render(ctx) must produce the normal response for this request. Pass the
 * ctx it should use (the real one, or a stand-in during a background refresh).
 */
export async function cachedPage(request, env, ctx, routeType, render) {
  if (!env.CACHE || !env.DB || !eventCapture || !isCacheableRequest(request, routeType)) {
    return render(ctx);
  }
  const url = new URL(request.url);
  const geo = visitorGeo(request);
  // The key no longer carries the epoch: the epoch lives inside the stored page, so the
  // epoch and the page can be read at the same time (one round trip on a cold isolate,
  // not two), and a retired page is simply overwritten instead of left to expire.
  const key = `pc:${url.hostname}:${geo.country || "XX"}:${url.pathname}${cacheSearch(url)}`;

  let entry = null, src = "miss", ep = epochNow(env);
  const m = mem(env);
  const held = m && (m.pages.get(key) || m.missing.get(key));
  if (held && held.exp > Date.now() && ep !== null) {
    // A warm isolate never waits for KV: if its epoch is older than 30 s it is
    // re-read after the response is sent, and applies from the next visit on.
    if (m.epochExp <= Date.now() && ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(epoch(env).catch(() => {}));
    if (usable(held.entry, ep)) { entry = held.entry; src = "memory"; }
    else { m.pages.delete(key); m.missing.delete(key); }
  }
  if (!entry) {
    if (held) { m.pages.delete(key); m.missing.delete(key); }
    const [freshEpoch, got] = await Promise.all([epoch(env), getLocalWithSource(env, key, url.origin)]);
    ep = freshEpoch;
    if (usable(got.value, ep)) { entry = got.value; src = got.src; memPut(env, key, entry); }
  }
  rememberOrigin(env, ctx, url.origin);

  // Stored before the latest admin save? Anonymous visitors still get it at once (and it is refreshed); a signed-in
  // visitor, or a site that sets PAGE_CACHE_STRICT=1, waits for a fresh render instead.
  const wasRetired = !!entry && retired(entry, ep);
  if (wasRetired && (hasSession(request) || String(env.PAGE_CACHE_STRICT || "") === "1")) entry = null;

  if (entry) {
    replayEvents(request, env, ctx, entry.events);
    const age = (Date.now() - entry.generatedAt) / 1000;
    const old = wasRetired || age > PAGE_CACHE_CFG.FRESH_SECONDS;
    if (old && ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(refresh(request, env, key, (c) => render(c), ep));
    }
    return fromEntry(entry, old ? "stale" : "hit", src);
  }

  // miss: render normally (the visitor's own events are written as usual)
  const { response, events } = await renderCaptured(render.bind(null, ctx), false);
  if (!response) return render(ctx);
  const reason = skipReason(response, events);
  if (!reason) {
    const copy = response.clone();
    const html = await copy.text();
    const e = toEntry(response, html, events, ep);
    if (e) {
      const write = store(env, key, e, url.origin);
      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(write); else await write;
    }
  }
  if (GONE.has(response.status)) {
    // the page moved or was removed: make sure an older saved copy of it is not served again
    forget(env, key);
    const drop = deleteLocal(env, key, url.origin);
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(drop); else await drop;
  }
  try {
    const out = new Response(response.body, response);
    out.headers.set("x-page-cache", reason || "miss");
    out.headers.set("x-page-store", pageStore.last);
    return out;
  } catch { return response; }
}

/**
 * Scheduled warm-up: re-renders the home page and the pages visitors actually
 * open (taken from the Speed samples, if migration 0065 is applied), for the
 * countries they come from, so the first visitor after a quiet spell gets a
 * cached page instead of waiting for a cold render. Best effort and bounded.
 *
 * makeRender(request) -> (ctx) => Promise<Response>
 */
export async function warmPublicPages(env, makeRender, { maxRenders = 12 } = {}) {
  if (!env.CACHE || !env.DB || !eventCapture) return 0;
  let origin;
  try { origin = new URL(env.SITE_URL || (await getCached(env, ORIGIN_KEY)) || ""); } catch { return 0; }

  const paths = new Set(["/en"]);
  const countries = new Set(["RW"]);
  try {
    const p = await env.DB.prepare(
      "SELECT path, COUNT(*) AS c FROM perf_samples WHERE at >= datetime('now','-7 days') GROUP BY path ORDER BY c DESC LIMIT 10"
    ).all();
    for (const r of p.results || []) if (r.path && r.path.startsWith("/en") && !r.path.startsWith("/en/dashboard")) paths.add(r.path);
    const c = await env.DB.prepare(
      "SELECT country, COUNT(*) AS c FROM perf_samples WHERE at >= datetime('now','-7 days') AND country IS NOT NULL GROUP BY country ORDER BY c DESC LIMIT 4"
    ).all();
    for (const r of c.results || []) if (/^[A-Z]{2}$/.test(r.country)) countries.add(r.country);
  } catch { /* no samples yet: just the home page for the default country */ }

  let done = 0;
  const stamp = await epoch(env);
  for (const path of paths) {
    for (const country of countries) {
      if (done >= maxRenders) return done;
      try {
        const request = new Request(origin.origin + path, { headers: { "user-agent": "page-cache-warmup" } });
        Object.defineProperty(request, "cf", { value: { country, city: "Unknown" }, configurable: true });
        const { getRoute } = await import("./routes.js");
        const routeType = getRoute(request).type;
        if (!isCacheableRequest(request, routeType)) continue;
        const key = `pc:${origin.hostname}:${country}:${path}`;
        refreshing.delete(key);
        await refresh(request, env, key, makeRender(request), stamp);
        done++;
      } catch (e) {
        console.error("warm-up failed for", path, e && e.message);
      }
    }
  }
  return done;
}
