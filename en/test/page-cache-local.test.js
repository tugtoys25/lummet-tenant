import { test } from "node:test";
import assert from "node:assert/strict";
import { cachedPage, pageStore, _clearPageMemory } from "../worker/page-cache.js";
import { getLocal, setLocal, _resetLocalState } from "../worker/cache.js";
import { logEvent } from "../worker/database/analytics.js";

function kv() {
  const store = new Map(); let puts = 0;
  return { store, get puts() { return puts; },
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { puts++; store.set(k, v); },
    async delete(k) { store.delete(k); } };
}
function db() { return { prepare() { return { bind: () => ({ run: async () => ({}) }) }; } }; }
function fakeCaches(works = true) {
  const m = new Map();
  return { m, default: {
    async put(req, res) { if (works) m.set(req.url, await res.text()); },
    async match(req) { return m.has(req.url) ? new Response(m.get(req.url)) : undefined; },
  } };
}
function ctx() { const p = []; return { p, waitUntil: (x) => p.push(x) }; }
const req = () => { const r = new Request("https://site.test/en/casino/x"); Object.defineProperty(r, "cf", { value: { country: "RW", city: "Kigali" } }); return r; };
const render = (n) => async (c) => {
  n.n++;
  const w = logEvent(db(), { eventType: "CASINO_VIEW", casinoId: 7, countryCode: "RW", city: "Kigali", referrer: null, landingPage: "/en/casino/x" });
  if (c) c.waitUntil(w);
  return new Response("<html>p</html>", { headers: { "Content-Type": "text/html" } });
};

test("pages are saved in the Cache API, not KV, so the free KV write limit is never used", async () => {
  _resetLocalState();
  globalThis.caches = fakeCaches(true);
  try {
    const env = { CACHE: kv(), DB: db() }; const n = { n: 0 };
    const c1 = ctx();
    const first = await cachedPage(req(), env, c1, "casino", render(n)); await Promise.all(c1.p);
    assert.equal(first.headers.get("x-page-cache"), "miss");
    assert.equal(pageStore.last, "cache", "the save (done after the response) went to the Cache API");
    assert.equal(n.n, 1);
    assert.deepEqual([...env.CACHE.store.keys()].filter((k) => k !== "pc:origin"), [], "no KV write for the page");
    assert.equal(pageStore.last, "cache");
    const c2 = ctx();
    const res = await cachedPage(req(), env, c2, "casino", render(n)); await Promise.all(c2.p);
    assert.equal(res.headers.get("x-page-cache"), "hit");
    assert.equal(res.headers.get("x-page-store"), "cache");
    assert.equal(res.headers.get("x-page-source"), "memory", "a warm isolate answers from memory");
    _clearPageMemory(env);
    const c2b = ctx();
    const res2 = await cachedPage(req(), env, c2b, "casino", render(n)); await Promise.all(c2b.p);
    assert.equal(res2.headers.get("x-page-source"), "cache", "otherwise it is read from the Cache API");
    assert.equal(n.n, 1, "second visit did not render");
  } finally { delete globalThis.caches; _resetLocalState(); }
});

test("when the Cache API accepts but never returns a save (workers.dev), KV is used instead", async () => {
  _resetLocalState();
  globalThis.caches = fakeCaches(false);
  try {
    const env = { CACHE: kv(), DB: db() };
    assert.match(await setLocal(env, "k1", { a: 1 }, 60), /^kv:probe-failed\(/);
    assert.deepEqual(await getLocal(env, "k1"), { a: 1 });
    assert.equal(env.CACHE.puts, 1);
  } finally { delete globalThis.caches; _resetLocalState(); }
});

test("without the Cache API (tests, old runtimes) the KV path still works", async () => {
  _resetLocalState();
  const env = { CACHE: kv() };
  assert.equal(await setLocal(env, "k2", { b: 2 }, 120), "kv:no-cache-api");
  assert.deepEqual(await getLocal(env, "k2"), { b: 2 });
});

test("a failed save is reported, not hidden", async () => {
  _resetLocalState();
  const env = { CACHE: { async get() { return null; }, async put() { throw new Error("KV put() limit exceeded for the day."); } }, DB: db() };
  assert.equal(await setLocal(env, "k3", { c: 3 }, 60), "failed");
});

test("the Cache API key uses the visitor's own domain, and a refused save stops pointless background re-renders", async () => {
  _resetLocalState();
  const fc = fakeCaches(true); globalThis.caches = fc;
  try {
    const env = { CACHE: kv(), DB: db() }; const n = { n: 0 };
    const c1 = ctx();
    await cachedPage(req(), env, c1, "casino", render(n)); await Promise.all(c1.p);
    assert.ok([...fc.m.keys()].every((u) => u.startsWith("https://site.test/")), "keys are on the site's own domain");
  } finally { delete globalThis.caches; _resetLocalState(); }

  // saves refused (e.g. KV daily limit): a stale page is served, but no re-render is started
  const env2 = { CACHE: { async get(k) { return this.s && k.startsWith("pc:") && k !== "pc:epoch" ? this.s : null; }, async put() { throw new Error("limit"); }, s: null }, DB: db() };
  const n2 = { n: 0 };
  const c2 = ctx();
  await cachedPage(req("/en/casino/q"), env2, c2, "casino", render(n2)); await Promise.all(c2.p);
  assert.equal(pageStore.last, "failed");
  _clearPageMemory(env2);
  env2.CACHE.s = JSON.stringify({ html: "<html>old</html>", type: "text/html", cc: "", events: [], generatedAt: Date.now() - 5000 * 1000 });
  const c3 = ctx();
  const res = await cachedPage(req("/en/casino/q"), env2, c3, "casino", render(n2)); await Promise.all(c3.p);
  assert.equal(res.headers.get("x-page-cache"), "stale");
  assert.equal(n2.n, 1, "no background re-render while saves fail");
});

test("a save that becomes readable a moment later is still accepted as working", async () => {
  _resetLocalState();
  const m = new Map(); const visibleAt = new Map();
  globalThis.caches = { default: {
    async put(req, res) { m.set(req.url, await res.text()); visibleAt.set(req.url, Date.now() + 150); },
    async match(req) { return m.has(req.url) && Date.now() >= visibleAt.get(req.url) ? new Response(m.get(req.url)) : undefined; },
  } };
  try {
    const env = { CACHE: kv() };
    assert.equal(await setLocal(env, "slow", { z: 1 }, 60, "https://site.test"), "cache");
    assert.equal(env.CACHE.puts, 0);
  } finally { delete globalThis.caches; _resetLocalState(); }
});

test("a warm isolate serves a page from memory with no storage read, and an admin save retires it at once", async () => {
  const { bumpPageEpoch } = await import("../worker/page-cache.js");
  const env = { CACHE: kv(), DB: db() }; const n = { n: 0 };
  const c1 = ctx(); await cachedPage(req(), env, c1, "casino", render(n)); await Promise.all(c1.p);
  let reads = 0; const realGet = env.CACHE.get.bind(env.CACHE);
  env.CACHE.get = async (k) => { reads++; return realGet(k); };
  const c2 = ctx(); const res = await cachedPage(req(), env, c2, "casino", render(n)); await Promise.all(c2.p);
  assert.equal(res.headers.get("x-page-source"), "memory");
  assert.equal(reads, 0, "no KV read at all on a warm hit");
  await bumpPageEpoch(env);
  const c3 = ctx(); const res3 = await cachedPage(req(), env, c3, "casino", render(n)); await Promise.all(c3.p);
  assert.equal(res3.headers.get("x-page-cache"), "miss", "retired by the admin save");
  assert.equal(n.n, 2);
});

test("warm-up finds the site's address from live traffic when SITE_URL is not set", async () => {
  const { warmPublicPages } = await import("../worker/page-cache.js");
  const env = { CACHE: kv(), DB: db() };
  assert.equal(await warmPublicPages(env, () => async () => new Response("x")), 0, "nothing known yet");
  const c = ctx(); await cachedPage(req(), env, c, "casino", render({ n: 0 })); await Promise.all(c.p);
  assert.equal(JSON.parse(env.CACHE.store.get("pc:origin")), "https://site.test");
});
