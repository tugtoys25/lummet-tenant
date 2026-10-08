// test/super-api-analytics-parity.test.js -- Super API v15
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { seedBaseFixtures } from './support/fixtures.js';
import {
  handleAnalyticsOverview, handleAnalyticsGeo, handleAnalyticsHealth,
  handleAnalyticsAggregate, handleAnalyticsEvaluateAlerts, resolveDimensionNames
} from '../worker/super/handlers-analytics.js';
import { SUPER_API_VERSION } from '../worker/super/capabilities.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROUTER_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../worker/super/router.js'), 'utf-8');

const req = (u) => new Request(u);

describe('Super API v15 -- analytics parity', () => {
  let db, fx, env;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db); fx = await seedBaseFixtures(db); env = { DB: db };
  });

  test('version is at least 15 and the five new routes are registered', () => {
    assert.ok(SUPER_API_VERSION >= 15);
    const have = (m, p) => ROUTER_SRC.includes(`["${m}", "${p}"`);
    assert.ok(have('GET', '/en/api/super/analytics-geo'));
    assert.ok(have('GET', '/en/api/super/analytics-health'));
    assert.ok(have('POST', '/en/api/super/analytics-aggregate'));
    assert.ok(have('POST', '/en/api/super/analytics-evaluate-alerts'));
    assert.ok(have('POST', '/en/api/super/analytics-run-due-reports'));
  });

  test('overview rows now carry a human-readable name; dimensionId is unchanged', async () => {
    await db.prepare(`INSERT INTO analytics_daily (date, dimension_type, dimension_id, revenue, currency)
      VALUES ('2026-01-15','casino',?,100,'USD')`).bind(fx.casinoA).run();
    const body = await (await handleAnalyticsOverview(
      req('https://x/a?start_date=2026-01-01&end_date=2026-01-31&dimension_type=casino'), env)).json();
    const cname = (await db.prepare(`SELECT name FROM casinos WHERE id = ?`).bind(fx.casinoA).first()).name;
    assert.equal(body.rows[0].dimensionId, fx.casinoA);
    assert.equal(body.rows[0].name, cname);
  });

  test('a deleted dimension yields name null (row is kept), not an error', async () => {
    await db.prepare(`INSERT INTO analytics_daily (date, dimension_type, dimension_id, revenue, currency)
      VALUES ('2026-01-15','news',99999,1,'USD')`).run();
    const body = await (await handleAnalyticsOverview(
      req('https://x/a?start_date=2026-01-01&end_date=2026-01-31&dimension_type=news'), env)).json();
    assert.equal(body.rows[0].name, null);
  });

  test('resolveDimensionNames: unknown type / hostile ids never reach SQL', async () => {
    assert.equal((await resolveDimensionNames(db, 'users; DROP TABLE casinos', [1])).size, 0);
    assert.equal((await resolveDimensionNames(db, 'casino', ["1 OR 1=1", null])).size, 0);
    const still = await db.prepare(`SELECT COUNT(*) AS n FROM casinos`).first();
    assert.ok(still.n >= 1);
  });

  test('geo requires a date range; returns rows tenant-wide', async () => {
    assert.equal((await (await handleAnalyticsGeo(req('https://x/g'), env)).json()).success, false);
    await db.prepare(`INSERT INTO analytics_events (event_type, casino_id, country_code, occurred_at)
      VALUES ('TRACKING_LINK_CLICK', ?, 'GB', '2026-01-15 10:00:00')`).bind(fx.casinoA).run();
    const body = await (await handleAnalyticsGeo(req('https://x/g?start_date=2026-01-01&end_date=2026-01-31'), env)).json();
    assert.equal(body.success, true);
    assert.equal(body.rows.find(r => r.country === 'GB').clicks, 1);
  });

  test('health lists every scheduled job with a status', async () => {
    const body = await (await handleAnalyticsHealth(req('https://x/h'), env)).json();
    assert.equal(body.success, true);
    assert.ok(body.jobs.length >= 4);
    assert.ok(body.jobs.every(j => ['never_run', 'disabled', 'stale', 'ok'].includes(j.status)));
  });

  test('aggregate validates dates, runs, and records the cron run', async () => {
    const bad = await handleAnalyticsAggregate(req('https://x/p'), env, undefined, JSON.stringify({ start_date: 'nope', end_date: '2026-01-02' }));
    assert.equal(bad.status, 400);
    const rev = await handleAnalyticsAggregate(req('https://x/p'), env, undefined, JSON.stringify({ start_date: '2026-01-05', end_date: '2026-01-01' }));
    assert.equal(rev.status, 400);
    const ok = await handleAnalyticsAggregate(req('https://x/p'), env, undefined, JSON.stringify({ start_date: '2026-01-01', end_date: '2026-01-03' }));
    const body = await ok.json();
    assert.equal(body.success, true);
    assert.equal(body.daysProcessed, 3);
    const health = await (await handleAnalyticsHealth(req('https://x/h'), env)).json();
    assert.notEqual(health.jobs.find(j => j.key === 'analytics_aggregation').lastRunAt, null);
  });

  test('evaluate-alerts runs with no rules and reports a summary', async () => {
    const body = await (await handleAnalyticsEvaluateAlerts(req('https://x/e'), env)).json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.summary));
  });
});
