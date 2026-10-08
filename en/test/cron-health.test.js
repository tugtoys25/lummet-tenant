// test/cron-health.test.js
//
// Covers the exact bug class that prompted this feature: a scheduled
// job whose trigger never fires looks IDENTICAL from the dashboard to
// one whose feature flag is just off ("everything shows zero"). These
// tests verify the two are distinguishable, and that a manual backfill
// doesn't depend on the automation flag at all.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { backfillAnalyticsDaily } from '../worker/database/analytics.js';
import { recordCronRun, getCronHealth, CRON_JOBS } from '../worker/database/cron-health.js';
import { runAnalyticsAggregation, runProviderSync } from '../worker/cron.js';
import { evaluateAllRulesNow, evaluateAlertRules } from '../worker/database/alerts.js';
import { runDueReportSchedulesNow, runDueReportSchedules } from '../worker/database/reports.js';

async function seedCasino(db) {
  await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1, 'admin@test.local', 'x', 'admin')`).run();
  await db.prepare(`INSERT INTO casinos (id, name, slug, website_url, affiliate_url, created_by) VALUES (200, 'Casino X', 'casino-x', 'https://x.example', 'https://aff.example/x', 1)`).run();
}

async function insertEvent(db, { eventType, casinoId, occurredAt }) {
  await db.prepare(`INSERT INTO analytics_events (event_type, casino_id, occurred_at) VALUES (?, ?, ?)`).bind(eventType, casinoId, occurredAt).run();
}

describe('cron health tracking (never_run vs disabled vs stale vs ok)', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
  });

  test('a job that has never recorded a run shows "never_run" -- the trigger-not-configured case', async () => {
    const health = await getCronHealth(db);
    assert.equal(health.length, CRON_JOBS.length);
    for (const job of health) {
      assert.equal(job.status, 'never_run');
      assert.equal(job.lastRunAt, null);
    }
  });

  test('a job invoked with its flag OFF records the run and shows "disabled", not "never_run"', async () => {
    // Flag is absent (default off) -- runAnalyticsAggregation should
    // still be recorded as having run, distinguishing "the schedule
    // fired but chose to skip" from "the schedule never fired".
    await seedCasino(db);
    const env = { DB: db };
    const result = await runAnalyticsAggregation(env);
    assert.equal(result.skipped, true);

    const health = await getCronHealth(db);
    const job = health.find(j => j.key === 'analytics_aggregation');
    assert.equal(job.status, 'disabled');
    assert.ok(job.lastRunAt, 'a run WAS recorded even though the job itself skipped its work');
    assert.equal(job.lastResult.skipped, true);
  });

  test('a job invoked with its flag ON and recently run shows "ok"', async () => {
    await seedCasino(db);
    await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('analytics_aggregation_cron_enabled', 'true')`).run();
    await insertEvent(db, { eventType: 'CASINO_VIEW', casinoId: 200, occurredAt: '2026-01-15 09:00:00' });

    const env = { DB: db };
    await runAnalyticsAggregation(env); // aggregates "yesterday" relative to now -- date doesn't matter for this check
    const health = await getCronHealth(db);
    const job = health.find(j => j.key === 'analytics_aggregation');
    assert.equal(job.enabled, true);
    assert.equal(job.status, 'ok');
  });

  test('a stale job (ran long ago, flag still on) is flagged "stale", not silently "ok"', async () => {
    await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('alert_rules_cron_enabled', 'true')`).run();
    await recordCronRun(db, 'alert_evaluation', { skipped: false, summary: [] });
    // Backdate the recorded run to 2 days ago -- well past the 2x
    // expected-interval (6h * 2 = 12h) threshold.
    const staleTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('alert_evaluation_last_run_at', ?)`).bind(staleTime).run();

    const health = await getCronHealth(db);
    const job = health.find(j => j.key === 'alert_evaluation');
    assert.equal(job.status, 'stale');
  });

  test('recordCronRun never throws even if called with a malformed result', async () => {
    await assert.doesNotReject(() => recordCronRun(db, 'provider_sync', undefined));
    await assert.doesNotReject(() => recordCronRun(db, 'provider_sync', { skipped: false, results: 'not-an-array' }));
  });

  test('provider_sync run recording captures the synced count', async () => {
    await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('provider_sync_cron_enabled', 'true')`).run();
    const env = { DB: db };
    await runProviderSync(env);
    const health = await getCronHealth(db);
    const job = health.find(j => j.key === 'provider_sync');
    assert.equal(job.status, 'ok');
    assert.equal(job.lastResult.skipped, false);
    assert.equal(job.lastResult.synced, 0);
  });
});

describe('backfillAnalyticsDaily -- manual run does NOT depend on the cron flag', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    await seedCasino(db);
  });

  test('backfills multiple days in one call with the automation flag OFF (default)', async () => {
    await insertEvent(db, { eventType: 'CASINO_VIEW', casinoId: 200, occurredAt: '2026-02-01 09:00:00' });
    await insertEvent(db, { eventType: 'CASINO_VIEW', casinoId: 200, occurredAt: '2026-02-02 09:00:00' });
    await insertEvent(db, { eventType: 'CASINO_VIEW', casinoId: 200, occurredAt: '2026-02-03 09:00:00' });

    // No 'analytics_aggregation_cron_enabled' row at all -- this must
    // still work, unlike the flag-gated cron path.
    const result = await backfillAnalyticsDaily(db, { startDate: '2026-02-01', endDate: '2026-02-03' });
    assert.equal(result.daysProcessed, 3);

    for (const date of ['2026-02-01', '2026-02-02', '2026-02-03']) {
      const row = await db.prepare(`SELECT page_views FROM analytics_daily WHERE dimension_type = 'casino' AND dimension_id = 200 AND date = ?`).bind(date).first();
      assert.equal(row.page_views, 1, `expected a rolled-up row for ${date}`);
    }
  });

  test('re-running a backfill for the same range is idempotent, same as the cron path', async () => {
    await insertEvent(db, { eventType: 'CASINO_VIEW', casinoId: 200, occurredAt: '2026-03-01 09:00:00' });
    await backfillAnalyticsDaily(db, { startDate: '2026-03-01', endDate: '2026-03-01' });
    await backfillAnalyticsDaily(db, { startDate: '2026-03-01', endDate: '2026-03-01' });

    const count = await db.prepare(`SELECT COUNT(*) AS c FROM analytics_daily WHERE dimension_type = 'casino' AND dimension_id = 200 AND date = '2026-03-01'`).first();
    assert.equal(count.c, 1);
  });

  test('rejects a range larger than 92 days rather than silently running a huge backfill', async () => {
    await assert.rejects(
      () => backfillAnalyticsDaily(db, { startDate: '2020-01-01', endDate: '2020-12-31' }),
      /too large/
    );
  });
});

describe('evaluateAllRulesNow -- manual alert trigger does NOT depend on the cron flag', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1, 'admin@test.local', 'x', 'admin')`).run();
  });

  test('evaluates and triggers a due rule with the automation flag OFF (default)', async () => {
    // A simple, always-triggerable rule: zero_conversion on a global
    // scope with an impossibly low threshold day-count is awkward to
    // seed generically, so use the same tracking_link_health path the
    // existing evaluateHealthRule tests already exercise -- seed an
    // unhealthy tracking link and a health-failure rule.
    await db.prepare(`INSERT INTO affiliate_partners (id, name, slug, status, created_by) VALUES (1, 'P', 'p', 'active', 1)`).run();
    await db.prepare(`INSERT INTO affiliate_programs (id, partner_id, name, status, created_by) VALUES (1, 1, 'Prog', 'active', 1)`).run();
    await db.prepare(`INSERT INTO casinos (id, name, slug, website_url, affiliate_url, created_by) VALUES (1, 'C', 'c', 'https://c.example', 'https://aff.example', 1)`).run();
    await db.prepare(`
      INSERT INTO tracking_links (id, internal_name, tracking_code, destination_url, casino_id, partner_id, program_id, status, health_status)
      VALUES (1, 'link', 'code1', 'https://out.example', 1, 1, 1, 'active', 'unhealthy')
    `).run();
    await db.prepare(`
      INSERT INTO analytics_alert_rules (name, metric, scope_type, scope_id, threshold_type, threshold_value, comparison_window_days, enabled, created_by)
      VALUES ('Broken link', 'tracking_link_health', 'tracking_link', 1, 'health_failure', 1, 7, 1, 1)
    `).run();

    // No 'alert_rules_cron_enabled' row at all -- must still work.
    const result = await evaluateAllRulesNow(db);
    assert.equal(result.evaluated, 1);
    assert.equal(result.summary[0].triggered, true);

    const openAlerts = await db.prepare(`SELECT COUNT(*) AS c FROM analytics_alerts WHERE status = 'open'`).first();
    assert.equal(openAlerts.c, 1);
  });

  test('running it twice in a row does not create a duplicate open alert for the same unresolved condition', async () => {
    await db.prepare(`INSERT INTO affiliate_partners (id, name, slug, status, created_by) VALUES (1, 'P', 'p', 'active', 1)`).run();
    await db.prepare(`INSERT INTO affiliate_programs (id, partner_id, name, status, created_by) VALUES (1, 1, 'Prog', 'active', 1)`).run();
    await db.prepare(`INSERT INTO casinos (id, name, slug, website_url, affiliate_url, created_by) VALUES (1, 'C', 'c', 'https://c.example', 'https://aff.example', 1)`).run();
    await db.prepare(`
      INSERT INTO tracking_links (id, internal_name, tracking_code, destination_url, casino_id, partner_id, program_id, status, health_status)
      VALUES (1, 'link', 'code1', 'https://out.example', 1, 1, 1, 'active', 'unhealthy')
    `).run();
    await db.prepare(`
      INSERT INTO analytics_alert_rules (name, metric, scope_type, scope_id, threshold_type, threshold_value, comparison_window_days, enabled, created_by)
      VALUES ('Broken link', 'tracking_link_health', 'tracking_link', 1, 'health_failure', 1, 7, 1, 1)
    `).run();

    await evaluateAllRulesNow(db);
    const second = await evaluateAllRulesNow(db);
    assert.equal(second.summary[0].skipped, 'already open');

    const openAlerts = await db.prepare(`SELECT COUNT(*) AS c FROM analytics_alerts WHERE status = 'open'`).first();
    assert.equal(openAlerts.c, 1);
  });

  test('the flag-gated evaluateAlertRules() wrapper still correctly skips when the flag is off (refactor safety)', async () => {
    const result = await evaluateAlertRules(db);
    assert.equal(result.skipped, true);
  });
});

describe('runDueReportSchedulesNow -- manual report trigger does NOT depend on the cron flag', () => {
  let db, env;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1, 'admin@test.local', 'x', 'admin')`).run();
    env = { DB: db };
  });

  test('runs a due schedule with the automation flag OFF (default)', async () => {
    await db.prepare(`INSERT INTO report_definitions (id, name, report_type, owner_id) VALUES (1, 'Sched Report', 'casino_performance', 1)`).run();
    await db.prepare(`
      INSERT INTO report_schedules (id, report_id, frequency, timezone, next_run_at, enabled, output_format, created_by)
      VALUES (1, 1, 'daily', 'UTC', datetime('now', '-1 hour'), 1, 'json', 1)
    `).run();
    await db.prepare(`INSERT INTO report_recipients (schedule_id, user_id) VALUES (1, 1)`).run();

    // No 'report_schedules_cron_enabled' row at all -- must still work.
    const result = await runDueReportSchedulesNow(db, env);
    assert.equal(result.processed, 1);
    assert.equal(result.summary[0].success, true);

    const run = await db.prepare(`SELECT status FROM report_runs WHERE report_id = 1`).first();
    assert.equal(run.status, 'success');
  });

  test('a schedule that is not yet due is left alone', async () => {
    await db.prepare(`INSERT INTO report_definitions (id, name, report_type, owner_id) VALUES (1, 'Future Report', 'casino_performance', 1)`).run();
    await db.prepare(`
      INSERT INTO report_schedules (id, report_id, frequency, timezone, next_run_at, enabled, output_format, created_by)
      VALUES (1, 1, 'daily', 'UTC', datetime('now', '+1 day'), 1, 'json', 1)
    `).run();

    const result = await runDueReportSchedulesNow(db, env);
    assert.equal(result.processed, 0);
  });

  test('the flag-gated runDueReportSchedules() wrapper still correctly skips when the flag is off (refactor safety)', async () => {
    const result = await runDueReportSchedules(db, env);
    assert.equal(result.skipped, true);
  });
});
