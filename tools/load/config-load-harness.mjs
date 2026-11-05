#!/usr/bin/env node
// Phase 10 / B2: OFFLINE load harness for the configurable platform. Runs entirely in this process:
//   - the real Worker entry point (en/worker/index.js) and the real configuration routes,
//   - an in-memory SQLite database standing in for D1 (en/test/support/d1-shim.js, every migration applied),
//   - a Map standing in for KV.
// It is a REGRESSION and BUDGET harness (query counts, error counts, relative latency, rate-limit behaviour). It is NOT a capacity
// test: real D1 and KV latency, network, Cloudflare isolates and CPU limits are not simulated. For real numbers use the
// staging procedure in docs/LOAD_HARNESS_CONFIGURATION.md.
//
//   node tools/load/config-load-harness.mjs [--requests 3000] [--concurrency 25] [--hosts 20] [--json report.json]
//        [--max-p95-ms 50] [--max-error-rate 0] [--quiet]
//
// Exit codes: 0 every check met, 1 a check failed, 2 bad usage.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const EN = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../en');
const load = (p) => import(pathToFileURL(path.join(EN, p)).href);

export const EXIT = Object.freeze({ OK: 0, FAILED: 1, USAGE: 2 });

export function parseArgs(argv) {
  const o = { requests: 3000, concurrency: 25, hosts: 20, json: null, maxP95Ms: 50, maxErrorRate: 0, quiet: false };
  const num = (name, v, min, max) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw new Error(`--${name} must be a number from ${min} to ${max}`); return n; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--requests') { o.requests = num('requests', v, 1, 200000); i++; }
    else if (a === '--concurrency') { o.concurrency = num('concurrency', v, 1, 500); i++; }
    else if (a === '--hosts') { o.hosts = num('hosts', v, 1, 500); i++; }
    else if (a === '--max-p95-ms') { o.maxP95Ms = num('max-p95-ms', v, 0.001, 60000); i++; }
    else if (a === '--max-error-rate') { o.maxErrorRate = num('max-error-rate', v, 0, 1); i++; }
    else if (a === '--json') { if (!v) throw new Error('--json needs a file name'); o.json = v; i++; }
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`Unknown option ${a}`);
  }
  return o;
}

export function percentile(sorted, p) { if (!sorted.length) return 0; return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]; }
export function summarize(times) {
  const s = [...times].sort((a, b) => a - b); const sum = s.reduce((a, b) => a + b, 0);
  return { n: s.length, meanMs: s.length ? sum / s.length : 0, p50Ms: percentile(s, 50), p95Ms: percentile(s, 95), p99Ms: percentile(s, 99), maxMs: s.length ? s[s.length - 1] : 0 };
}

// Runs `total` calls of fn(i) with at most `concurrency` in flight. Records time and outcome of each.
export async function runPool(total, concurrency, fn) {
  const times = [], outcomes = new Map(); let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++; if (i >= total) return;
      const t0 = process.hrtime.bigint(); let status;
      try { status = await fn(i); } catch (e) { status = `threw:${e?.message || e}`; }
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      outcomes.set(status, (outcomes.get(status) || 0) + 1);
    }
  };
  const t0 = process.hrtime.bigint();
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  const seconds = Number(process.hrtime.bigint() - t0) / 1e9;
  return { ...summarize(times), outcomes: Object.fromEntries(outcomes), seconds, rps: seconds > 0 ? total / seconds : 0 };
}

const kv = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } }; };

// Counts every D1 statement prepared through the wrapper.
function counted(db) {
  const log = [];
  return { log, DB: { prepare(sql) { log.push(String(sql).replace(/\s+/g, ' ').trim()); return db.prepare(sql); }, batch: (s) => db.batch(s), exec: (s) => db.exec(s) } };
}

const okStatus = (r) => (r.status >= 200 && r.status < 400 ? 'ok' : String(r.status));
// A gated page legitimately answers 404 (or a redirect); what matters is that the answer does not CHANGE under load.
// Each path's answer is probed once, then every later answer must be the same ("ok" if it matches, the odd status otherwise).
const sameAs = (expected, r) => (r.status === expected ? 'ok' : String(r.status));

export async function runHarness(opts) {
  const fx = await load('test/support/transfer-fixtures.js');
  const worker = (await load('worker/index.js')).default;
  const profile = await load('worker/site-profile/profile.js');
  const store = await load('worker/site-profile/store.js');
  const sys = await load('worker/site-profile/system-flag.js');
  const limits = await load('worker/api/config-limits.js');
  const transfer = await load('worker/api/routes/site-profile-transfer.js');
  const spRoute = await load('worker/api/routes/site-profile.js');

  const report = { generatedAt: new Date().toISOString(), node: process.version, options: opts, notCapacity: 'In-memory SQLite and Map stand in for D1 and KV. Numbers are relative, not capacity.', scenarios: {}, checks: [] };
  const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, detail });

  const { db, env: base } = fx.freshSite();
  await fx.setSetting(db, 'site_profile', JSON.stringify(profile.applyPreset('news')));
  await fx.setSetting(db, 'theme_primary', '#112233');
  const c = counted(db);
  const env = { ...base, DB: c.DB, CACHE: kv(), ASSETS: { fetch: async () => new Response('asset') } };
  const hostNames = Array.from({ length: opts.hosts }, (_, i) => `t${i}.example`);
  const ctx = { waitUntil() {} };
  const get = (host, p) => worker.fetch(new Request(`https://${host}${p}`), env, ctx);

  // 1. Public pages, warm: the configuration layer must add no D1 statement per request.
  await Promise.all(hostNames.map((h) => get(h, '/en/news')));
  const profileReads = () => c.log.filter((s) => /FROM settings WHERE key IN \(\?, \?\)/.test(s)).length;
  const paths = ['/en/news', '/en/casino', '/en/about', '/en/login'];
  const expected = {}; for (const p of paths) expected[p] = (await get(hostNames[0], p)).status;
  report.expectedStatus = { ...expected };
  check('probe: the news preset serves /en/news and removes /en/casino', expected['/en/news'] < 400 && expected['/en/casino'] >= 400, JSON.stringify(expected));
  c.log.length = 0;
  report.scenarios.publicWarm = await runPool(opts.requests, opts.concurrency, async (i) => { const p = paths[i % paths.length]; return sameAs(expected[p], await get(hostNames[i % hostNames.length], p)); });
  report.scenarios.publicWarm.profileReadsDuringRun = profileReads();
  report.scenarios.publicWarm.statementsPerRequest = c.log.length / opts.requests;
  check('warm public requests: zero profile/master-switch statements', report.scenarios.publicWarm.profileReadsDuringRun === 0, `${report.scenarios.publicWarm.profileReadsDuringRun} reads in ${opts.requests} requests`);

  // 2. Cold start across many tenants: one statement per tenant, not per request.
  const coldEnv = { ...env, CACHE: kv() }; c.log.length = 0;
  const coldHosts = hostNames.map((h) => `cold-${h}`);
  // Strict part: when each tenant's first request finishes before its next one, a tenant costs exactly one statement.
  for (const h of coldHosts) await worker.fetch(new Request(`https://${h}/en/news`), coldEnv, ctx);
  const sequentialReads = profileReads();
  check('cold start, one request at a time: exactly one profile statement per tenant', sequentialReads === coldHosts.length, `${sequentialReads} reads for ${coldHosts.length} tenants`);
  // Concurrent part (informational): simultaneous first requests for one tenant may each read once (no single-flight). Recorded, not asserted tightly.
  const burstEnv = { ...env, CACHE: kv() }; c.log.length = 0;
  const burstHosts = hostNames.map((h) => `burst-${h}`);
  report.scenarios.publicCold = await runPool(burstHosts.length * 5, opts.concurrency, async (i) => { const r = await worker.fetch(new Request(`https://${burstHosts[i % burstHosts.length]}/en/news`), burstEnv, ctx); return sameAs(expected['/en/news'], r); });
  report.scenarios.publicCold.profileReadsDuringRun = profileReads();
  report.scenarios.publicCold.requests = burstHosts.length * 5;
  check('cold burst: never more than one profile statement per request', report.scenarios.publicCold.profileReadsDuringRun <= report.scenarios.publicCold.requests, `${report.scenarios.publicCold.profileReadsDuringRun} reads for ${report.scenarios.publicCold.requests} requests over ${burstHosts.length} tenants`);

  // 3. Resolver only.
  await store.loadProfile(env, hostNames[0]);
  report.scenarios.resolverCached = await runPool(opts.requests * 5, opts.concurrency, async () => { await store.loadProfile(env, hostNames[0]); return 'ok'; });

  // 4. Master switch off by environment: nothing read, public pages still served.
  const offEnv = { ...env, CACHE: kv(), [sys.SYSTEM_ENV]: 'off' };
  const expectedOff = {}; for (const p of paths) expectedOff[p] = (await worker.fetch(new Request(`https://${hostNames[0]}${p}`), offEnv, ctx)).status;
  check('probe: with the switch off the removed page is served again (full platform)', expectedOff['/en/casino'] < 400 || expectedOff['/en/casino'] !== expected['/en/casino'], JSON.stringify(expectedOff));
  c.log.length = 0;
  report.scenarios.switchOff = await runPool(Math.min(opts.requests, 1000), opts.concurrency, async (i) => { const p = paths[i % paths.length]; return sameAs(expectedOff[p], await worker.fetch(new Request(`https://${hostNames[i % hostNames.length]}${p}`), offEnv, ctx)); });
  report.scenarios.switchOff.note = 'Statuses are not compared with the news preset: with the switch off the full platform is served.';
  report.scenarios.switchOff.profileReadsDuringRun = profileReads();
  check('switch off: zero profile statements', report.scenarios.switchOff.profileReadsDuringRun === 0, `${report.scenarios.switchOff.profileReadsDuringRun} reads`);

  // 5. Configuration API as staff. Each staff member is a different user so the per-user limit is not what is being measured here.
  const mkReq = (method, p, body) => ({ method, url: `https://${hostNames[0]}${p}`, headers: new Headers(), json: async () => { if (body === undefined) throw new Error('no body'); return body; } });
  const staff = (i) => ({ user_id: 1000 + i, email: `s${i}@t.example`, role: 'admin' });
  report.scenarios.apiState = await runPool(Math.min(opts.requests, 1000), opts.concurrency, async (i) => {
    const p = '/api/v1/config/transfer/state';
    const r = await transfer.route({ request: mkReq('GET', p), env, path: p, user: staff(i) }); return okStatus(r);
  });
  report.scenarios.apiSettings = await runPool(Math.min(opts.requests, 1000), opts.concurrency, async (i) => {
    const p = '/api/v1/site-profile/settings';
    const r = await spRoute.route({ request: mkReq('GET', p), env, path: p, user: staff(i) }); return okStatus(r);
  });
  report.scenarios.apiExport = await runPool(Math.min(opts.requests, 500), opts.concurrency, async (i) => {
    const p = '/api/v1/config/transfer/export';
    const r = await transfer.route({ request: mkReq('GET', `${p}?sections=settings.theme`), env, path: p, user: staff(i) }); return okStatus(r);
  });

  // 6. Rate limiter under a burst from ONE person: the first LIMITS.export requests pass, the rest get 429 with Retry-After.
  const one = staff(99999); let retryAfterSeen = 0;
  report.scenarios.exportBurst = await runPool(limits.LIMITS.export + 15, 1, async () => {
    const p = '/api/v1/config/transfer/export';
    const r = await transfer.route({ request: mkReq('GET', `${p}?sections=settings.theme`), env, path: p, user: one });
    if (r.status === 429 && r.headers.get('Retry-After')) retryAfterSeen++;
    return okStatus(r);
  });
  const o = report.scenarios.exportBurst.outcomes;
  check('rate limit: exactly the configured number pass, the rest are 429', (o.ok || 0) === limits.LIMITS.export && (o['429'] || 0) === 15, JSON.stringify(o));
  check('rate limit: every 429 carries Retry-After', retryAfterSeen === 15, `${retryAfterSeen} of 15`);
  const rows = Number((await db.prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE action LIKE 'cfg:%'").first()).n);
  report.scenarios.exportBurst.limiterRows = rows;

  // 7. Oversized body is refused before it is parsed.
  const http = await load('worker/api/config-http.js');
  const bigText = 'x'.repeat(http.MAX_BODY_IMPORT + 1024);
  const bigReq = new Request(`https://${hostNames[0]}/api/v1/config/transfer/plan`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(bigText.length + 10) }, body: JSON.stringify({ text: bigText }) });
  const bigRes = await transfer.route({ request: bigReq, env, path: '/api/v1/config/transfer/plan', user: staff(88888) });
  check('oversized import body is refused with 413 before parsing', bigRes.status === 413, `status ${bigRes.status}, limit ${http.MAX_BODY_IMPORT} bytes`);

  // Latency and error checks over every scenario that serves real traffic.
  const traffic = ['publicWarm', 'publicCold', 'resolverCached', 'switchOff', 'apiState', 'apiSettings', 'apiExport'];
  for (const name of traffic) {
    const s = report.scenarios[name]; const errors = Object.entries(s.outcomes).filter(([k]) => k !== 'ok').reduce((a, [, n]) => a + n, 0);
    s.errorRate = s.n ? errors / s.n : 0;
    check(`${name}: error rate <= ${opts.maxErrorRate}`, s.errorRate <= opts.maxErrorRate, `${errors} of ${s.n}`);
    check(`${name}: p95 <= ${opts.maxP95Ms} ms`, s.p95Ms <= opts.maxP95Ms, `${s.p95Ms.toFixed(3)} ms`);
  }
  report.passed = report.checks.every((x) => x.pass);
  return report;
}

export function formatReport(r) {
  const lines = [`Lummet configuration load harness (offline). Node ${r.node}`, r.notCapacity, ''];
  lines.push('scenario          n      rps      mean ms   p50 ms   p95 ms   p99 ms   outcomes');
  for (const [name, s] of Object.entries(r.scenarios)) {
    lines.push(`${name.padEnd(16)} ${String(s.n).padStart(6)} ${s.rps.toFixed(0).padStart(8)} ${s.meanMs.toFixed(3).padStart(10)} ${s.p50Ms.toFixed(3).padStart(8)} ${s.p95Ms.toFixed(3).padStart(8)} ${s.p99Ms.toFixed(3).padStart(8)}   ${JSON.stringify(s.outcomes)}`);
  }
  lines.push('', 'checks:'); for (const x of r.checks) lines.push(`  ${x.pass ? 'PASS' : 'FAIL'}  ${x.name}  (${x.detail})`);
  lines.push('', r.passed ? 'RESULT: all checks met (offline only; not a capacity or production claim)' : 'RESULT: A CHECK FAILED');
  return lines.join('\n');
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(EXIT.USAGE); }
  if (opts.help) { console.log('Usage: node tools/load/config-load-harness.mjs [--requests N] [--concurrency N] [--hosts N] [--json file] [--max-p95-ms N] [--max-error-rate 0..1] [--quiet]'); process.exit(EXIT.OK); }
  const report = await runHarness(opts);
  if (opts.json) await writeFile(opts.json, JSON.stringify(report, null, 2));
  if (!opts.quiet) console.log(formatReport(report));
  process.exit(report.passed ? EXIT.OK : EXIT.FAILED);
}
