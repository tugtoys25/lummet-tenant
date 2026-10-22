import { test } from "node:test";
import assert from "node:assert/strict";
import { cachedPage, isCacheableRequest, isContentWrite, bumpPageEpoch, _clearPageMemory } from "../worker/page-cache.js";
import { logEvent } from "../worker/database/analytics.js";

function kv() {
  const store = new Map();
  return { store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); } };
}
function db() {
  const rows = [];
  return { rows, prepare() { return { bind: (...v) => ({ run: async () => { rows.push(v); return {}; } }) }; } };
}
function ctx() { const p = []; return { p, waitUntil: (x) => p.push(x) }; }
const req = (path = "/en/casino/x", init = {}, cf = { country: "RW", city: "Kigali" }) => {
  const r = new Request("https://site.test" + path, init);
  Object.defineProperty(r, "cf", { value: cf });
  return r;
};

// a render that behaves like renderCasino: fires a view event, returns html
function makeRender(env, request, counter) {
  return async (c) => {
    counter.n++;
    const work = logEvent(env.DB, { eventType: "CASINO_VIEW", casinoId: 7, countryCode: "RW", city: "Kigali",
      referrer: request.headers.get("referer") || null, landingPage: "/en/casino/x" });
    if (c) c.waitUntil(work); else await work;
    return new Response("<html>page</html>", { headers: { "Content-Type": "text/html", "Cache-Control": "public, s-maxage=60" } });
  };
}

test("eligibility: GET, no query, content route, not lummet", () => {
  assert.equal(isCacheableRequest(req(), "casino"), true);
  assert.equal(isCacheableRequest(req("/en/casino/x?partial=1"), "casino"), true);
  assert.equal(isCacheableRequest(req("/en/casino/x?geo=CA"), "casino"), false);
  assert.equal(isCacheableRequest(req("/en/news?page=2"), "newsList"), false);
  assert.equal(isCacheableRequest(req("/en/casino/x", { method: "POST" }), "casino"), false);
  assert.equal(isCacheableRequest(req("/en/dashboard"), "dashboard"), false);
  assert.equal(isCacheableRequest(req("/en/search"), "siteSearch"), false);
  assert.equal(isCacheableRequest(new Request("https://lummet.site.test/en/casino/x"), "casino"), false);
});

test("a hit skips the renderer but still records the view with the visitor's own details", async () => {
  const env = { CACHE: kv(), DB: db() }; const n = { n: 0 };
  const r1 = req("/en/casino/x", { headers: { referer: "https://google.com/" } });
  const c1 = ctx();
  const res1 = await cachedPage(r1, env, c1, "casino", makeRender(env, r1, n));
  await Promise.all(c1.p);
  assert.equal(await res1.text(), "<html>page</html>");
  assert.equal(n.n, 1);
  assert.equal(env.DB.rows.length, 1);

  const r2 = req("/en/casino/x", { headers: { referer: "https://bing.com/" } }, { country: "KE", city: "Nairobi" });
  const c2 = ctx();
  const res2 = await cachedPage(r2, env, c2, "casino", makeRender(env, r2, n));
  await Promise.all(c2.p);
  assert.equal(res2.headers.get("x-page-cache"), "miss", "first KE visit is a miss");
  assert.equal(n.n, 2, "KE has its own cache entry (country is part of the key)");

  const r3 = req("/en/casino/x", { headers: { referer: "https://bing.com/" } });
  const c3 = ctx();
  const res3 = await cachedPage(r3, env, c3, "casino", makeRender(env, r3, n));
  await Promise.all(c3.p);
  assert.equal(res3.headers.get("x-page-cache"), "hit");
  assert.equal(n.n, 2, "RW hit did not render");
  assert.equal(env.DB.rows.length, 3, "every view is still counted");
  const last = env.DB.rows[2];
  assert.ok(last.includes("https://bing.com/"), "replay uses this visitor's referrer");
  assert.ok(last.includes("CASINO_VIEW") && last.includes(7));
  assert.equal(res3.headers.get("cache-control"), "public, s-maxage=60");
});

test("stale copy is served at once and refreshed in the background without double counting", async () => {
  const env = { CACHE: kv(), DB: db() }; const n = { n: 0 };
  const r = req();
  let c = ctx();
  await cachedPage(r, env, c, "casino", makeRender(env, r, n)); await Promise.all(c.p);
  const key = [...env.CACHE.store.keys()].find((k) => k.startsWith("pc:") && k !== "pc:origin");
  const e = JSON.parse(env.CACHE.store.get(key)); e.generatedAt -= 2000 * 1000;
  env.CACHE.store.set(key, JSON.stringify(e));
  _clearPageMemory(env);
  const rowsBefore = env.DB.rows.length;

  c = ctx();
  const res = await cachedPage(r, env, c, "casino", makeRender(env, r, n));
  assert.equal(res.headers.get("x-page-cache"), "stale");
  await Promise.all(c.p);
  assert.equal(n.n, 2, "background refresh rendered once");
  assert.equal(env.DB.rows.length, rowsBefore + 1, "one replayed view, refresh wrote none");
  const e2 = JSON.parse(env.CACHE.store.get(key));
  assert.equal(e2.events.length, 1, "refresh kept the recorded events");
});

test("non-200, unknown event fields and missing storage are never cached", async () => {
  const env = { CACHE: kv(), DB: db() };
  const c = ctx();
  const res404 = await cachedPage(req("/en/casino/none"), env, c, "casino", async () => new Response("no", { status: 404, headers: { "content-type": "text/html" } }));
  assert.equal(res404.status, 404);
  assert.equal([...env.CACHE.store.keys()].filter((k) => k.startsWith("pc:") && k !== "pc:origin").length, 0);

  const odd = async (cx) => { const w = logEvent(env.DB, { eventType: "PAGE_VIEW", pageId: 1, visitorHash: "abc123" }); if (cx) cx.waitUntil(w); return new Response("x", { headers: { "content-type": "text/html" } }); };
  const oddRes = await cachedPage(req("/en/p"), env, ctx(), "page", odd);
  assert.equal(oddRes.headers.get("x-page-cache"), "skip:event-field-visitorHash", "the header says why it was not cached");
  assert.equal([...env.CACHE.store.keys()].filter((k) => k.startsWith("pc:") && k !== "pc:origin").length, 0);

  let calls = 0;
  const plain = async () => { calls++; return new Response("x", { headers: { "content-type": "text/html" } }); };
  await cachedPage(req(), { DB: db() }, ctx(), "casino", plain);
  assert.equal(calls, 1);
});

test("an admin save retires every cached page; visitor writes do not", async () => {
  const env = { CACHE: kv(), DB: db() }; const n = { n: 0 };
  const r = req();
  let c = ctx();
  await cachedPage(r, env, c, "casino", makeRender(env, r, n)); await Promise.all(c.p);
  c = ctx(); await cachedPage(r, env, c, "casino", makeRender(env, r, n)); await Promise.all(c.p);
  assert.equal(n.n, 1);

  const post = (p) => new Request("https://site.test" + p, { method: "POST" });
  assert.equal(isContentWrite(post("/en/api/v1/casino/5"), 200), true);
  assert.equal(isContentWrite(post("/en/api/v1/settings"), 200), true);
  assert.equal(isContentWrite(post("/en/api/v1/casino/5"), 500), false);
  assert.equal(isContentWrite(post("/en/api/v1/ai/chat"), 200), false);
  assert.equal(isContentWrite(post("/en/api/v1/newsletter/subscribe"), 200), false);
  assert.equal(isContentWrite(post("/en/api/v1/user/bookmark"), 200), false);
  assert.equal(isContentWrite(new Request("https://site.test/en/api/v1/casino/5"), 200), false);

  await bumpPageEpoch(env);
  c = ctx(); await cachedPage(r, env, c, "casino", makeRender(env, r, n)); await Promise.all(c.p);
  assert.equal(n.n, 2, "re-rendered after the epoch changed");
});

import { warmPublicPages } from "../worker/page-cache.js";
import { getLatestNews } from "../worker/database/news.js";
import { createTestDb, applyMigrations } from "./support/d1-shim.js";

test("warm-up renders home for the default country and the pages/countries visitors use, and refreshes stale entries", async () => {
  const d = createTestDb(); applyMigrations(d);
  await d.prepare("INSERT INTO perf_samples (path, route, state, ms, status, country) VALUES ('/en/casino/x', 'casino', 'miss', 900, 200, 'KE')").run();
  const env = { CACHE: kv(), DB: d, SITE_URL: "https://site.test" };
  const seen = [];
  const n = await warmPublicPages(env, (request) => async () => {
    seen.push(new URL(request.url).pathname + ":" + request.cf.country);
    return new Response("<html>warm</html>", { headers: { "content-type": "text/html" } });
  });
  assert.ok(n >= 2);
  assert.ok(seen.includes("/en:RW") && seen.includes("/en:KE") && seen.includes("/en/casino/x:KE"));
  const keys = [...env.CACHE.store.keys()].filter((k) => k.startsWith("pc:") && k !== "pc:origin");
  assert.ok(keys.some((k) => k.endsWith(":RW:/en")));

  // a later visitor gets it as a hit without rendering
  const r = new Request("https://site.test/en"); Object.defineProperty(r, "cf", { value: { country: "RW" } });
  let rendered = 0;
  const res = await cachedPage(r, env, ctx(), "home", async () => { rendered++; return new Response("x"); });
  assert.equal(res.headers.get("x-page-cache"), "hit");
  assert.equal(rendered, 0);

  assert.equal(await warmPublicPages({ CACHE: kv(), DB: d }, () => async () => new Response("x")), 0, "needs SITE_URL");
});

test("latest news query returns a short list without full article text", async () => {
  const d = createTestDb(); applyMigrations(d);
  for (let i = 0; i < 30; i++) {
    await d.prepare("INSERT INTO news (slug, title, content, published, created_at) VALUES (?, ?, ?, 1, datetime('now', ?))").bind("s" + i, "Story " + i, "x".repeat(5000), `-${i} minutes`).run();
  }
  await d.prepare("INSERT INTO news (slug, title, content, published) VALUES ('draft', 'Draft', 'd', 0)").run();
  const four = await getLatestNews(d, 4);
  assert.equal(four.length, 4);
  assert.equal(four[0].slug, "s0");
  assert.ok(four.every((r) => r.content.length <= 300));
  assert.ok(!four.some((r) => r.slug === "draft"));
  const found = await getLatestNews(d, 20, "Story 2");
  assert.ok(found.length >= 1 && found.every((r) => r.title.includes("Story 2")));
  assert.equal((await getLatestNews(d, 500)).length, 30, "limit is capped and drafts excluded");
});

import { handleAPI } from "../worker/api.js";

test("public news list is short and carries no full article text, even from an older cached long list", async () => {
  const d = createTestDb(); applyMigrations(d);
  for (let i = 0; i < 30; i++) {
    await d.prepare("INSERT INTO news (slug, title, content, published, created_at) VALUES (?, ?, ?, 1, datetime('now', ?))").bind("s" + i, "Story " + i, "y".repeat(8000), `-${i} minutes`).run();
  }
  const env = { DB: d, CACHE: kv() };
  const call = async (path) => handleAPI(new Request("https://site.test/en" + path), env, path.split("?")[0], null);

  const body = await (await call("/api/v1/public/news/list")).json();
  assert.equal(body.news.length, 12);
  assert.ok(body.news.every((n) => n.content.length <= 300));
  assert.ok(JSON.stringify(body).length < 20000, "payload stays small");

  // a long, full-text list cached by an older version is trimmed on the way out
  env.CACHE.store.set("public:news:latest", JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ slug: "o" + i, title: "Old " + i, content: "z".repeat(9000) }))));
  const old = await (await call("/api/v1/public/news/list")).json();
  assert.equal(old.news.length, 12);
  assert.ok(old.news.every((n) => n.content.length <= 300));

  const q = await (await call("/api/v1/public/news/list?q=Story%203")).json();
  assert.ok(q.news.length >= 1 && q.news.every((n) => n.title.includes("Story 3")));
});

test("a page with banner views (metadata with plain values) is cached; nested or visitor-specific metadata is not", async () => {
  const env = { CACHE: kv(), DB: db() }; let calls = 0;
  const banner = async (cx) => {
    calls++;
    const w = logEvent(env.DB, { eventType: "BANNER_VIEW", metadata: { componentId: 3, componentName: "Promo", pageType: "casino", pageSlug: "x" } });
    if (cx) cx.waitUntil(w);
    return new Response("<html>b</html>", { headers: { "content-type": "text/html" } });
  };
  const c1 = ctx(); await cachedPage(req(), env, c1, "casino", banner); await Promise.all(c1.p);
  const c2 = ctx(); const res = await cachedPage(req(), env, c2, "casino", banner); await Promise.all(c2.p);
  assert.equal(res.headers.get("x-page-cache"), "hit");
  assert.equal(calls, 1);

  const nested = async (cx) => { const w = logEvent(env.DB, { eventType: "BANNER_VIEW", metadata: { who: { id: 1 } } }); if (cx) cx.waitUntil(w); return new Response("n", { headers: { "content-type": "text/html" } }); };
  const r3 = await cachedPage(req("/en/casino/y"), env, ctx(), "casino", nested);
  assert.equal(r3.headers.get("x-page-cache"), "skip:event-field-metadata");
});
