import { aggregateAnalyticsDaily } from './database/analytics.js';
import { runDueReportSchedules } from './database/reports.js';
import { evaluateAlertRules } from './database/alerts.js';
import { getConfigsDueForSync } from './database/provider-adapters.js';
import { syncAllDueProviders } from './adapters/sync.js';
import { recordCronRun } from './database/cron-health.js';
import { buildAndSendWeeklyDigest } from './content-notifications.js';

export async function cleanupExpiredSessions(env) {

    await env.DB.prepare(`
        DELETE FROM sessions
        WHERE expires_at < CURRENT_TIMESTAMP
    `).run();

}

// Analytics daily aggregation (Phase 4). Mirrors the existing
// runScheduledHealthChecks() contract exactly: checks its own
// system_settings feature flag, always safe to call even when
// disabled (default), never throws out to the caller.
//
// recordCronRun() is called EVERY invocation, skipped-or-not -- its
// absence entirely (never a single row) is how the admin health
// indicator (worker/database/cron-health.js) tells "the schedule
// never fires at all" apart from "it fires but is turned off".
export async function runAnalyticsAggregation(env) {
    const result = await aggregateAnalyticsDaily(env.DB);
    await recordCronRun(env.DB, 'analytics_aggregation', result);
    return result;
}

// Scheduled report execution (Phase 9). Same contract as above.
export async function runScheduledReports(env) {
    const result = await runDueReportSchedules(env.DB, env);
    await recordCronRun(env.DB, 'report_schedules', result);
    return result;
}

// Alert-rule evaluation (Phase 13). Same contract as above.
export async function runAlertEvaluation(env) {
    const result = await evaluateAlertRules(env.DB);
    await recordCronRun(env.DB, 'alert_evaluation', result);
    return result;
}

// Outbound provider/API adapter sync (brief §10). Same feature-flag
// contract as the jobs above -- checks 'provider_sync_cron_enabled'
// (default 'false', see migration 0035) and never fetches or writes
// anything when it's off. Deliberately reads the flag here rather than
// inside syncAllDueProviders(), matching where every other job in this
// file makes that check, so the on/off behavior of every scheduled job
// is visible in one place.
export async function runProviderSync(env) {
    const flag = await env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'provider_sync_cron_enabled'`).first();
    if (!flag || flag.value !== 'true') {
        const result = { skipped: true, reason: 'provider_sync_cron_enabled is not "true"' };
        await recordCronRun(env.DB, 'provider_sync', result);
        return result;
    }

    const configs = await getConfigsDueForSync(env.DB);
    if (configs.length === 0) {
        const result = { skipped: false, synced: 0, results: [] };
        await recordCronRun(env.DB, 'provider_sync', result);
        return result;
    }

    const results = await syncAllDueProviders(env.DB, env, configs);
    const result = { skipped: false, synced: results.length, results };
    await recordCronRun(env.DB, 'provider_sync', result);
    return result;
}

// Weekly subscriber digest email (see worker/content-notifications.js
// for the actual content build + send). Same feature-flag convention
// as every job above ('weekly_digest_cron_enabled' in system_settings,
// default off). Unlike the others, this job is only meant to actually
// SEND about once every 7 days even though the underlying Cloudflare
// cron trigger fires far more often (every 6 hours, per
// wrangler.jsonc) -- so it tracks its own separate
// 'weekly_digest_last_attempt_at' cadence marker in system_settings,
// deliberately apart from recordCronRun()'s 'weekly_digest_last_run_at'
// (that one is written on EVERY invocation, skipped-or-not, per the
// existing health-check contract -- it can't also be reused as the
// 7-day gate without breaking that contract for the admin health page).
export async function runWeeklyDigest(env) {
    const flag = await env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'weekly_digest_cron_enabled'`).first();
    if (!flag || flag.value !== 'true') {
        const result = { skipped: true, reason: 'weekly_digest_cron_enabled is not "true"' };
        await recordCronRun(env.DB, 'weekly_digest', result);
        return result;
    }

    const lastAttempt = await env.DB.prepare(`SELECT value FROM system_settings WHERE key = 'weekly_digest_last_attempt_at'`).first();
    const daysSinceLastAttempt = lastAttempt?.value
        ? (Date.now() - new Date(lastAttempt.value).getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;

    if (daysSinceLastAttempt < 7) {
        const result = { skipped: true, reason: `last attempted ${daysSinceLastAttempt.toFixed(1)}d ago, due again at 7d` };
        await recordCronRun(env.DB, 'weekly_digest', result);
        return result;
    }

    const result = await buildAndSendWeeklyDigest(env);

    await env.DB.prepare(`INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('weekly_digest_last_attempt_at', ?, CURRENT_TIMESTAMP)`)
        .bind(new Date().toISOString()).run();
    await recordCronRun(env.DB, 'weekly_digest', result);
    return result;
}
