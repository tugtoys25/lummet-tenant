// Phase 10 / B1: performance budget of the configurable platform.
//  - STRICT: how many D1 statements the configuration layer costs. A cached public request costs ZERO, a cold one exactly ONE
//    (profile and master switch are read together). Counted by wrapping env.DB.prepare, so a new query fails this file.
//  - LOOSE: wall-clock time of the resolver (cached read + gate). The blueprint target is < 1 ms; the assertion is deliberately
//    generous (CI machines are noisy) and the measured numbers are printed when the file runs and recorded in
//    docs/CHANGES_PHASE_10B.md. Timing is never asserted tightly.
// NOT verified here: real D1 latency, real KV latency, a real Worker isolate.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshSite, setSetting } from './support/transfer-fixtures.js';
import worker from '../worker/index.js';
import { loadProfile } from '../worker/site-profile/store.js';
import { SYSTEM_ENV, SYSTEM_KEY } from '../worker/site-profile/system-flag.js';
import { applyPreset, gate, pruneAdminNavHtml, isEnabled } from '../worker/site-profile/profile.js';
import { getRoute } from '../worker/routes.js';
import { needsRewrite } from '../worker/site-profile/links.js';

const HOST = 't.example';
const kv = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } }; };

// Wraps DB so every prepare() is recorded with its SQL and, once bound, its parameters.
function counted(db) {
  const log = [];
  return {
    log,
    DB: { prepare(sql) {
      const entry = { sql: String(sql).replace(/\s+/g, ' ').trim(), params: [] }; log.push(entry);
      const st = db.prepare(sql);
      return new Proxy(st, { get(t, p) { if (p === 'bind') return (...a) => { entry.params = a; return t.bind(...a); }; const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } });
    } },
    reset() { log.length = 0; },
    // a statement that reads the stored profile and/or the master switch
    profileReads() { return log.filter((e) => e.params.includes('site_profile') || e.params.includes(SYSTEM_KEY)); },
  };
}

let db, base, c, env;
beforeEach(async () => {
  ({ db, env: base } = freshSite());
  await setSetting(db, 'site_profile', JSON.stringify(applyPreset('news')));
  c = counted(db);
  env = { ...base, DB: c.DB, CACHE: kv(), ASSETS: { fetch: async () => new Response('asset') } };
});

describe('STRICT: D1 statements used by the resolver', () => {
  test('cold: exactly ONE statement reads the profile and the master switch together', async () => {
    await loadProfile(env, HOST);
    assert.equal(c.log.length, 1);
    assert.match(c.log[0].sql, /FROM settings WHERE key IN \(\?, \?\)/);
    assert.deepEqual([...c.log[0].params].sort(), [SYSTEM_KEY, 'site_profile'].sort());
  });
  test('cached: ZERO statements, however many times it is read', async () => {
    await loadProfile(env, HOST); c.reset();
    for (let i = 0; i < 200; i++) await loadProfile(env, HOST);
    assert.equal(c.log.length, 0);
  });
  test('cached in KV but cold in this isolate (L1 empty): still ZERO D1 statements', async () => {
    await loadProfile(env, HOST); c.reset();
    const sameKvNewIsolate = { ...env, CACHE: { get: env.CACHE.get, put: env.CACHE.put, delete: env.CACHE.delete } }; // a different object = an empty L1
    await loadProfile(sameKvNewIsolate, HOST);
    assert.equal(c.log.length, 0);
  });
  test('switched off by the environment variable: ZERO statements, cold or not', async () => {
    const off = { ...env, [SYSTEM_ENV]: 'off' };
    for (let i = 0; i < 3; i++) await loadProfile(off, HOST);
    assert.equal(c.log.length, 0);
  });
  test('a flip of the settings-key switch costs one statement per cache miss and none after', async () => {
    await loadProfile(env, HOST); await setSetting(db, SYSTEM_KEY, 'off');
    const { invalidateProfile } = await import('../worker/site-profile/store.js');
    c.reset(); await invalidateProfile(env, HOST);
    await loadProfile(env, HOST); await loadProfile(env, HOST);
    assert.equal(c.log.length, 1);
  });
  test('the pure layer (gate, isEnabled, nav pruning, link-rewrite check) never touches the database', async () => {
    const p = await loadProfile(env, HOST); c.reset();
    for (const path of ['/en', '/en/casino', '/en/news', '/en/about', '/en/login', '/en/dashboard/casinos']) gate(getRoute({ url: `https://${HOST}${path}` }), p);
    isEnabled(p, 'news.article'); needsRewrite(p); pruneAdminNavHtml('<a href="/en/dashboard/casinos">c</a>', p);
    assert.equal(c.log.length, 0);
  });
});

describe('STRICT: whole-request budget through the real worker entry point', () => {
  const get = (e, path) => worker.fetch(new Request(`https://${HOST}${path}`), e, { waitUntil() {} });
  // Budget = the measured number of statements with a warm cache, per route (written down so growth is a conscious decision).
  const WARM_BUDGET = { '/en/news': 0, '/en/casino': 0, '/en/about': 0, '/en/login': 1 };
  for (const [path, budget] of Object.entries(WARM_BUDGET)) {
    test(`${path}: cold request reads the profile at most once; warm request reads it never and stays within ${budget} statement(s)`, async () => {
      await get(env, path);
      assert.ok(c.profileReads().length <= 1, `cold profile reads: ${c.profileReads().length}`);
      c.reset();
      const res = await get(env, path); await res.text();
      assert.equal(c.profileReads().length, 0, 'the configuration layer adds no statement on a warm request');
      assert.ok(c.log.length <= budget, `warm request used ${c.log.length} statements (budget ${budget}): ${c.log.map((e) => e.sql.slice(0, 70)).join(' | ')}`);
    });
  }
  test('the configuration system adds NOTHING on a warm request: the same route costs the same with the system on and switched off', async () => {
    const path = '/en/login';
    await get(env, path); c.reset(); await (await get(env, path)).text(); const on = c.log.length;
    const off = { ...env, [SYSTEM_ENV]: 'off' };
    await get(off, path); c.reset(); await (await get(off, path)).text(); const offCount = c.log.length;
    assert.equal(on, offCount);
  });
  test('a gated (removed) page and a normal page both use at most one profile statement cold', async () => {
    for (const path of ['/en/casino', '/en/news']) { const fresh = { ...env, CACHE: kv() }; c.reset(); await get(fresh, path); assert.ok(c.profileReads().length <= 1, path); }
  });
});

describe('LOOSE: resolver timing (generous thresholds; numbers printed for the record)', () => {
  const mean = (fn, n) => { const t0 = process.hrtime.bigint(); for (let i = 0; i < n; i++) fn(i); return Number(process.hrtime.bigint() - t0) / 1e6 / n; };
  test('cached resolver read + gate: mean well under the 1 ms target, asserted at < 5 ms', async () => {
    await loadProfile(env, HOST);
    const N = 2000; const t0 = process.hrtime.bigint();
    let last; for (let i = 0; i < N; i++) last = await loadProfile(env, HOST);
    const perRead = Number(process.hrtime.bigint() - t0) / 1e6 / N;
    const route = getRoute({ url: `https://${HOST}/en/casino` });
    const perGate = mean(() => gate(route, last), 20000);
    console.log(`# measured: cached loadProfile ${perRead.toFixed(4)} ms/call, gate ${perGate.toFixed(5)} ms/call (Node ${process.version}, in-memory fakes)`);
    assert.ok(perRead < 5, `cached read mean ${perRead} ms`);
    assert.ok(perGate < 1, `gate mean ${perGate} ms`);
  });
  test('cold resolver read (one in-memory query): asserted at < 25 ms mean', async () => {
    const N = 200; const t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) await loadProfile({ ...env, CACHE: kv() }, HOST);
    const per = Number(process.hrtime.bigint() - t0) / 1e6 / N;
    console.log(`# measured: cold loadProfile ${per.toFixed(4)} ms/call (in-memory SQLite, not real D1)`);
    assert.ok(per < 25, `cold read mean ${per} ms`);
  });
});
