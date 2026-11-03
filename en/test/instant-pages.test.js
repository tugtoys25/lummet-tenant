// Instant pages (tenant v22.62): one-round-trip cold reads, no KV wait on a warm isolate,
// templates kept across requests, cached pages stored with versioned asset URLs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cachedPage, bumpPageEpoch, _clearPageMemory } from "../worker/page-cache.js";
import { finalizeResponse } from "../worker/static-assets.js";
import { ASSET_VERSION } from "../worker/asset-version.js";
import { Renderer } from "../worker/render.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function kv({ delay = 0 } = {}) {
  const store = new Map(); const stats = { inflight: 0, maxInflight: 0, gets: 0 };
  return { store, stats,
    async get(k) {
      stats.gets++; stats.inflight++; stats.maxInflight = Math.max(stats.maxInflight, stats.inflight);
      if (delay) await sleep(delay);
      stats.inflight--;
      return store.has(k) ? store.get(k) : null;
    },
    async put(k, v) { store.set(k, v); }, async delete(k) { store.delete(k); } };
}
function db() { return { prepare() { return { bind: () => ({ run: async () => ({}) }) }; } }; }
function ctx() { const p = []; return { p, waitUntil: (x) => p.push(x) }; }
const req = (path = "/en") => { const r = new Request("https://site.test" + path); Object.defineProperty(r, "cf", { value: { country: "RW", city: "Kigali" } }); return r; };
const render = (n) => async () => { n.n++; return new Response('<html><link rel="stylesheet" href="/static/css/main.css"></html>', { headers: { "Content-Type": "text/html" } }); };

test("a cold isolate reads the save counter and the page at the same time, not one after the other", async () => {
  const env = { CACHE: kv({ delay: 30 }), DB: db() }; const n = { n: 0 };
  const c1 = ctx();
  await cachedPage(req(), env, c1, "home", render(n)); await Promise.all(c1.p);
  _clearPageMemory(env); env.CACHE.stats.maxInflight = 0;
  const res = await cachedPage(req(), env, ctx(), "home", render(n));
  assert.equal(res.headers.get("x-page-cache"), "hit");
  assert.equal(n.n, 1, "no second render");
  assert.ok(env.CACHE.stats.maxInflight >= 2, "both reads were in flight together (one round trip, not two)");
});

test("an admin save retires the stored page; the new copy replaces it under the same key", async () => {
  const env = { CACHE: kv(), DB: db() }; const n = { n: 0 };
  const c1 = ctx();
  await cachedPage(req(), env, c1, "home", render(n)); await Promise.all(c1.p);
  const keys = () => [...env.CACHE.store.keys()].filter((k) => k.startsWith("pc:") && k !== "pc:origin" && k !== "pc:epoch");
  assert.equal(keys().length, 1);
  await bumpPageEpoch(env);
  const c2 = ctx();
  const res = await cachedPage(req(), env, c2, "home", render(n)); await Promise.all(c2.p);
  assert.equal(res.headers.get("x-page-cache"), "miss", "retired page is not served");
  assert.equal(n.n, 2);
  assert.equal(keys().length, 1, "same key, overwritten (no orphan copy left behind)");
  const c3 = ctx();
  const again = await cachedPage(req(), env, c3, "home", render(n));
  assert.equal(again.headers.get("x-page-cache"), "hit");
  assert.equal(n.n, 2);
});

test("a warm isolate answers from memory without waiting for a slow KV, even when its counter is old", async () => {
  const env = { CACHE: kv(), DB: db() }; const n = { n: 0 };
  const c1 = ctx();
  await cachedPage(req(), env, c1, "home", render(n)); await Promise.all(c1.p);
  // from now on KV is slow, and the isolate's 30 s counter window looks expired
  const origGet = env.CACHE.get.bind(env.CACHE);
  env.CACHE.get = async (k) => { await sleep(200); return origGet(k); };
  const realNow = Date.now; Date.now = () => realNow() + 31000;
  try {
    const c2 = ctx();
    const t0 = realNow();
    const res = await cachedPage(req(), env, c2, "home", render(n));
    const took = realNow() - t0;
    assert.equal(res.headers.get("x-page-source"), "memory");
    assert.ok(took < 100, `did not wait for KV (took ${took} ms)`);
    await Promise.all(c2.p); // the counter is re-read after the response was sent
  } finally { Date.now = realNow; }
});

test("cached pages are stored with ?v= asset URLs and pass through finalizeResponse unread", async () => {
  const env = { CACHE: kv(), DB: db() }; const n = { n: 0 };
  const c1 = ctx();
  await cachedPage(req(), env, c1, "home", render(n)); await Promise.all(c1.p);
  const hit = await cachedPage(req(), env, ctx(), "home", render(n));
  assert.equal(hit.headers.get("x-assets-versioned"), ASSET_VERSION);
  const out = await finalizeResponse(req(), hit);
  const html = await out.text();
  assert.ok(html.includes(`/static/css/main.css?v=${ASSET_VERSION}`), "versioned once");
  assert.ok(!html.includes(`?v=${ASSET_VERSION}?v=`), "never twice");
  assert.equal(out.headers.get("x-assets-versioned"), null, "internal marker is not sent to the browser");
  // an uncached page still gets rewritten
  const plain = await finalizeResponse(req(), new Response('<link href="/static/css/a.css">', { headers: { "content-type": "text/html" } }));
  assert.ok((await plain.text()).includes(`a.css?v=${ASSET_VERSION}`));
});

test("templates are fetched once per isolate, not once per request", async () => {
  let fetches = 0;
  const ASSETS = { async fetch(r) { fetches++; return new Response(`T:${new URL(r.url).pathname}`); } };
  const env = { ASSETS };
  const a = new Renderer(env, new Request("https://site.test/en"));
  const b = new Renderer(env, new Request("https://site.test/en"));
  assert.equal(await a.loadTemplate("layout/base.html"), "T:/templates/layout/base.html");
  assert.equal(await b.loadTemplate("layout/base.html"), "T:/templates/layout/base.html");
  assert.equal(fetches, 1);
  // a missing template is not remembered: the next request tries again
  let missing = 0;
  const env2 = { ASSETS: { async fetch() { missing++; return new Response("no", { status: 404 }); } } };
  assert.equal(await new Renderer(env2).loadTemplate("x.html"), null);
  assert.equal(await new Renderer(env2).loadTemplate("x.html"), null);
  assert.equal(missing, 2);
});

// ---- "page not found" copies (short-lived) ----
const missing = (n) => async () => { n.n++; return new Response("<html>404</html>", { status: 404, headers: { "Content-Type": "text/html" } }); };
const kvKeys = (env) => [...env.CACHE.store.keys()].filter((k) => k.startsWith("pc:") && k !== "pc:origin" && k !== "pc:epoch");

test("a 404 page is reused for a minute without rendering again, and never written to KV", async () => {
  const env = { CACHE: kv(), DB: db() }; const n = { n: 0 };
  const c1 = ctx();
  const first = await cachedPage(req("/en/nope"), env, c1, "casinoList", missing(n)); await Promise.all(c1.p);
  assert.equal(first.status, 404);
  assert.equal(first.headers.get("x-page-cache"), "miss");
  const second = await cachedPage(req("/en/nope"), env, ctx(), "casinoList", missing(n));
  assert.equal(second.status, 404, "still a real 404 for browsers and search engines");
  assert.equal(second.headers.get("x-page-cache"), "hit");
  assert.equal(second.headers.get("x-page-source"), "memory");
  assert.equal(await second.text(), "<html>404</html>");
  assert.equal(n.n, 1);
  assert.deepEqual(kvKeys(env), [], "no KV write: a crawler could use up the daily limit");
});

test("after a minute the 404 is rendered again, so a page published meanwhile appears", async () => {
  const env = { CACHE: kv(), DB: db() }; const n = { n: 0 };
  const c1 = ctx();
  await cachedPage(req("/en/soon"), env, c1, "casinoList", missing(n)); await Promise.all(c1.p);
  const realNow = Date.now; Date.now = () => realNow() + 61000;
  try {
    const c2 = ctx();
    const res = await cachedPage(req("/en/soon"), env, c2, "casinoList", async () => { n.n++; return new Response("<html>now live</html>", { headers: { "Content-Type": "text/html" } }); });
    await Promise.all(c2.p);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "<html>now live</html>");
    assert.equal(n.n, 2);
  } finally { Date.now = realNow; }
});

test("an admin save retires a stored 404 at once", async () => {
  const env = { CACHE: kv(), DB: db() }; const n = { n: 0 };
  const c1 = ctx();
  await cachedPage(req("/en/new"), env, c1, "casinoList", missing(n)); await Promise.all(c1.p);
  await bumpPageEpoch(env);
  const res = await cachedPage(req("/en/new"), env, ctx(), "casinoList", async () => new Response("<html>created</html>", { headers: { "Content-Type": "text/html" } }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-page-cache"), "miss");
});

test("many random 404 addresses never push a real page out of memory", async () => {
  const env = { CACHE: kv(), DB: db() }; const n = { n: 0 };
  const c1 = ctx();
  await cachedPage(req("/en"), env, c1, "home", render(n)); await Promise.all(c1.p);
  for (let i = 0; i < 80; i++) {
    const c = ctx();
    await cachedPage(req("/en/junk-" + i), env, c, "casinoList", missing({ n: 0 })); await Promise.all(c.p);
  }
  const home = await cachedPage(req("/en"), env, ctx(), "home", render(n));
  assert.equal(home.headers.get("x-page-source"), "memory");
  assert.equal(n.n, 1);
});

test("with a working Cloudflare cache the 404 is kept there; other error codes are never cached", async () => {
  const m = new Map();
  globalThis.caches = { default: {
    async put(r, res) { m.set(r.url, await res.text()); },
    async match(r) { return m.has(r.url) ? new Response(m.get(r.url)) : undefined; } } };
  try {
    const env = { CACHE: kv(), DB: db() }; const n = { n: 0 };
    const c1 = ctx();
    await cachedPage(req("/en/gone"), env, c1, "casinoList", missing(n)); await Promise.all(c1.p);
    assert.ok([...m.keys()].some((u) => u.includes("gone")), "stored in the Cloudflare cache");
    assert.deepEqual(kvKeys(env), []);
    const err = await cachedPage(req("/en/boom"), env, ctx(), "casinoList", async () => new Response("e", { status: 500, headers: { "Content-Type": "text/html" } }));
    assert.equal(err.headers.get("x-page-cache"), "skip:status");
    assert.ok(![...m.keys()].some((u) => u.includes("boom")));
  } finally { delete globalThis.caches; }
});
