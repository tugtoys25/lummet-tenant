import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTestDb, applyMigrations } from "./support/d1-shim.js";
import { recordSample, speedSummary, percentile, pageState, SAMPLE_RATE } from "../worker/perf.js";
import { getRoute } from "../worker/routes.js";
import { handleAPI } from "../worker/api.js";

const req = (p) => { const r = new Request("https://site.test" + p); Object.defineProperty(r, "cf", { value: { country: "RW" } }); return r; };
const res = (state) => new Response("x", { status: 200, headers: state ? { "x-page-cache": state } : {} });
function ctx() { const p = []; return { p, waitUntil: (x) => p.push(x) }; }

test("percentile and page state", () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([10, 20, 30, 40], 50), 20);
  assert.equal(percentile([10, 20, 30, 40], 95), 40);
  assert.equal(pageState(res("hit")), "hit");
  assert.equal(pageState(res("stale")), "stale");
  assert.equal(pageState(res(null)), "miss");
});

test("samples are recorded only when sampled, for 200s, and never throw", async () => {
  const db = createTestDb(); applyMigrations(db);
  const env = { DB: db };
  const c = ctx();
  recordSample(env, c, req("/en/casino/a"), "casino", res("hit"), 12, SAMPLE_RATE + 0.01); // not sampled
  recordSample(env, c, req("/en/casino/a"), "casino", new Response("x", { status: 404 }), 12, 0); // not 200
  assert.equal(c.p.length, 0);
  recordSample(env, c, req("/en/casino/a"), "casino", res("hit"), 12.4, 0);
  await Promise.all(c.p);
  const row = await db.prepare("SELECT * FROM perf_samples").first();
  assert.equal(row.path, "/en/casino/a"); assert.equal(row.state, "hit"); assert.equal(row.ms, 12); assert.equal(row.country, "RW");

  // no table (migration not applied) or no ctx: silent
  const bare = { DB: createTestDb() };
  const c2 = ctx();
  recordSample(bare, c2, req("/en/x"), "page", res(null), 5, 0);
  await Promise.all(c2.p);
  recordSample(env, null, req("/en/x"), "page", res(null), 5, 0);
});

test("summary: hit rate, typical and slowest times, missing-table hint", async () => {
  const db = createTestDb(); applyMigrations(db);
  const add = (path, state, ms) => db.prepare("INSERT INTO perf_samples (path, route, state, ms, status) VALUES (?, 'casino', ?, ?, 200)").bind(path, state, ms).run();
  for (const ms of [20, 30, 40]) await add("/en/casino/fast", "hit", ms);
  for (const ms of [400, 600, 900]) await add("/en/casino/slow", "miss", ms);
  await add("/en/casino/once", "miss", 5000);
  await db.prepare("INSERT INTO perf_samples (at, path, route, state, ms, status) VALUES (datetime('now','-30 days'), '/old', 'x', 'miss', 9999, 200)").run();

  const s = await speedSummary({ DB: db });
  assert.equal(s.available, true);
  assert.equal(s.samples, 7, "old rows are outside the window");
  assert.equal(s.cache_hit_rate, 42.9);
  assert.equal(s.hit.p50, 30);
  assert.equal(s.slowest[0].path, "/en/casino/slow");
  assert.ok(!s.slowest.some((r) => r.path === "/en/casino/once"), "needs 3 samples");
  assert.ok(s.asset_version);

  const none = await speedSummary({ DB: createTestDb() });
  assert.equal(none.available, false);
  assert.match(none.hint, /0065/);
});

test("route, API guard, page and nav are wired; admin script uses DOM APIs only", async () => {
  assert.equal(getRoute(new Request("https://site.test/en/dashboard/speed")).type, "dashboardSpeed");
  const db = createTestDb(); applyMigrations(db);
  const env = { DB: db };
  const anon = await handleAPI(req("/api/v1/speed/summary"), env, "/api/v1/speed/summary", null);
  assert.equal(anon.status, 403);
  const editor = await handleAPI(req("/api/v1/speed/summary"), env, "/api/v1/speed/summary", { role: "editor" });
  assert.equal(editor.status, 403);
  const admin = await handleAPI(req("/api/v1/speed/summary"), env, "/api/v1/speed/summary", { role: "admin" });
  assert.equal(admin.status, 200);
  assert.equal((await admin.json()).available, true);

  assert.match(readFileSync(new URL("../templates/layout/admin-nav.html", import.meta.url), "utf8"), /\/en\/dashboard\/speed/);
  assert.doesNotMatch(readFileSync(new URL("../static/js/speed-admin.js", import.meta.url), "utf8"), /innerHTML/);
  assert.match(readFileSync(new URL("../templates/pages/admin/speed.html", import.meta.url), "utf8"), /speed-admin\.js/);
});
