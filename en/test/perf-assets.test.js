import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { selectAssetSet, needsAdminAssets } from "../worker/render.js";
import { staticCacheControl, versionAssetUrls, finalizeResponse } from "../worker/static-assets.js";
import { ASSET_VERSION } from "../worker/asset-version.js";
import { computeAssetVersion } from "../scripts/asset-version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = readFileSync(join(root, "templates/layout/base.html"), "utf8");
const srcs = (html, re) => [...html.matchAll(re)].map((m) => m[1]);
const scripts = (html) => srcs(html, /<script[^>]*src="(\/static\/js\/[^"]+)"/g);
const styles = (html) => srcs(html, /<link[^>]*href="(\/static\/css\/[^"]+)"/g);

test("asset version matches the files (run: node scripts/asset-version.mjs)", () => {
  assert.equal(ASSET_VERSION, computeAssetVersion(root));
});

test("only the dashboard and user area get the admin asset set", () => {
  assert.equal(needsAdminAssets("/en/dashboard"), true);
  assert.equal(needsAdminAssets("/en/dashboard/casinos"), true);
  assert.equal(needsAdminAssets("/en/user/profile"), true);
  assert.equal(needsAdminAssets("/en/casino/x"), false);
  assert.equal(needsAdminAssets("/en"), false);
  assert.equal(needsAdminAssets("/en/dashboardx"), false);
});

test("public pages load a lean, non-blocking asset set", () => {
  const pub = selectAssetSet(base, "/en/casino/bet");
  assert.ok(!pub.includes("@full"));
  const js = scripts(pub);
  assert.ok(js.length <= 12, `public scripts: ${js.length}`);
  assert.ok(js.includes("/static/js/app.js") && js.includes("/static/js/lummet-ai.js"));
  for (const bad of ["admin", "dashboard", "media-library", "media-picker", "rich-editor", "ai-studio"]) {
    assert.ok(!js.some((s) => s.includes(bad)), `public page must not load ${bad}`);
  }
  assert.ok(!styles(pub).some((s) => /dashboard/.test(s)));
  for (const m of pub.matchAll(/<script\b([^>]*)>/g)) {
    if (/src=/.test(m[1])) assert.match(m[1], /\bdefer\b|\basync\b|type="module"/, `blocking script: ${m[0]}`);
  }
});

test("dashboard keeps every admin script and style", () => {
  const full = selectAssetSet(base, "/en/dashboard/casinos");
  assert.ok(!full.includes("@full"));
  const js = scripts(full);
  for (const need of ["admin-permissions", "dashboard-shell", "ai-studio", "media-library", "media-picker", "rich-editor"]) {
    assert.ok(js.some((s) => s.includes(need)), `dashboard must load ${need}`);
  }
  assert.ok(styles(full).some((s) => s.includes("dashboard-shell")));
  // media-library/picker must be defined before scripts that use them
  assert.ok(js.indexOf("/static/js/media-picker.js") < js.indexOf("/static/js/admin/init.js"));
});

test("every referenced script and stylesheet exists", () => {
  const all = selectAssetSet(base, "/en/dashboard");
  for (const f of [...scripts(all), ...styles(all)]) {
    assert.ok(existsSync(join(root, f.replace(/^\//, ""))), `missing ${f}`);
  }
});

test("css/js URLs get ?v= and cache headers match the file kind", () => {
  const out = versionAssetUrls('<link href="/static/css/main.css"><script src="/static/js/app.js"></script><img src="/static/images/a.png">', "abc");
  assert.match(out, /main\.css\?v=abc/);
  assert.match(out, /app\.js\?v=abc/);
  assert.ok(!out.includes("a.png?v"));
  assert.match(staticCacheControl("/static/js/app.js", true), /immutable/);
  assert.doesNotMatch(staticCacheControl("/static/js/app.js", false), /immutable/);
  assert.equal(staticCacheControl("/static/sw.js", false), "no-cache");
  assert.match(staticCacheControl("/static/images/a.png", false), /max-age=86400/);
});

test("finalizeResponse versions HTML and caches static files, leaves the rest", async () => {
  const html = new Response('<script src="/static/js/app.js"></script>', { headers: { "content-type": "text/html" } });
  const r1 = await finalizeResponse(new Request("https://x.test/en"), html);
  assert.match(await r1.text(), /app\.js\?v=/);

  const st = await finalizeResponse(new Request("https://x.test/static/js/app.js?v=1"), new Response("x"));
  assert.match(st.headers.get("cache-control"), /immutable/);

  const json = new Response("{}", { headers: { "content-type": "application/json" } });
  assert.equal(await finalizeResponse(new Request("https://x.test/en/api/v1/x"), json), json);

  const post = new Response("<p>", { headers: { "content-type": "text/html" } });
  assert.equal(await finalizeResponse(new Request("https://x.test/en", { method: "POST" }), post), post);

  const nf = new Response("no", { status: 404 });
  assert.equal(await finalizeResponse(new Request("https://x.test/static/none.js"), nf), nf);
});

test("service worker no longer precaches or serves stale unversioned assets", () => {
  const sw = readFileSync(join(root, "static/sw.js"), "utf8");
  assert.match(sw, /-v3`/);
  assert.match(sw, /STATIC_ASSETS = \[\]/);
  assert.match(sw, /searchParams\.has\("v"\)/);
});

import { getCached, setCached, invalidate } from "../worker/cache.js";

function fakeKv() {
  const store = new Map();
  const kv = { reads: 0, store,
    async get(k) { kv.reads++; return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); } };
  return kv;
}

test("L1 cache: repeat reads skip KV, invalidate clears, copies are independent", async () => {
  const env = { CACHE: fakeKv() };
  await setCached(env, "k", { a: [1] });
  const one = await getCached(env, "k");
  one.a.push(2);
  assert.deepEqual(await getCached(env, "k"), { a: [1] });
  assert.equal(env.CACHE.reads, 0);

  await invalidate(env, "k");
  assert.equal(await getCached(env, "k"), null);

  // a value written elsewhere is read from KV once, then served from memory
  env.CACHE.store.set("z", JSON.stringify({ n: 1 }));
  await getCached(env, "z"); await getCached(env, "z");
  assert.equal(env.CACHE.reads, 2); // "k" miss + "z" first read

  // separate bindings never share entries
  const other = { CACHE: fakeKv() };
  assert.equal(await getCached(other, "z"), null);
});

import { PUBLIC_JSON_CACHE } from "../worker/static-assets.js";

test("public sidebar/geo JSON is browser-cached; admin and other JSON is not", async () => {
  const j = () => new Response("{}", { headers: { "content-type": "application/json" } });
  for (const p of ["/en/api/v1/public/casinos/geo", "/en/api/v1/public/news/list", "/en/api/v1/public/categories/list",
    "/en/api/v1/public/countries/list", "/en/api/v1/public/casino-reviews", "/en/api/v1/geo/check"]) {
    const r = await finalizeResponse(new Request("https://x.test" + p + "?slug=a"), j());
    assert.equal(r.headers.get("cache-control"), PUBLIC_JSON_CACHE, p);
  }
  for (const p of ["/en/api/v1/casino/1", "/en/api/v1/user/profile", "/en/api/v1/public/search", "/en/api/v1/ai/chat"]) {
    const orig = j();
    assert.equal(await finalizeResponse(new Request("https://x.test" + p), orig), orig, p);
  }
  const post = j();
  assert.equal(await finalizeResponse(new Request("https://x.test/en/api/v1/geo/check", { method: "POST" }), post), post);
});

test("casino page asks for its own reviews only and does not repeat the geo request", () => {
  const js = readFileSync(join(root, "static/js/casino.js"), "utf8");
  assert.match(js, /casino-reviews\?casino_slug=/);
  assert.doesNotMatch(js, /public\/reviews\/list/);
  assert.doesNotMatch(js, /^\s*loadGeoInfo\(\);/m);
});

test("versionAssetUrls also versions the import map of the rich editor parts", () => {
  const html = '<script type="importmap">{"imports":{"/static/js/rich-editor/utils.js": "/static/js/rich-editor/utils.js"}}</script><script type="module" src="/static/js/rich-editor.js"></script>';
  const out = versionAssetUrls(html, "abc");
  assert.ok(out.includes('"/static/js/rich-editor/utils.js": "/static/js/rich-editor/utils.js?v=abc"'));
  assert.ok(out.includes('"/static/js/rich-editor/utils.js":'), "the key (import specifier) stays unversioned");
  assert.ok(out.includes('src="/static/js/rich-editor.js?v=abc"'));
});
