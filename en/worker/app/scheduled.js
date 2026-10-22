// The cron (scheduled) handler: cleanups, aggregation, reports, health checks, page-cache warm-up.
// appWorker is passed in (not imported) so this file does not depend on app-worker.js.
import { cleanupExpiredConversations } from "../ai/memory.js";
import { cleanupExpiredSessions, runAlertEvaluation, runAnalyticsAggregation, runChatQualityReport, runProviderSync, runScheduledReports, runWeeklyDigest } from "../cron.js";
import { runScheduledHealthChecks } from "../tracking/health-check.js";
import { runScheduledResearchSourceHealthChecks } from "../research/source-health.js";
import { warmPublicPages } from "../page-cache.js";

export async function runScheduled(appWorker, event, env, ctx) {
        ctx.waitUntil(cleanupExpiredConversations(env.DB));

        ctx.waitUntil(
            cleanupExpiredSessions(env)
        );

        // Link health monitoring (System 3) -- runScheduledHealthChecks()
        // checks the system_settings feature flag itself and no-ops when
        // it's off (the default), so this call is always safe to leave
        // in place even before the flag is deliberately enabled for a
        // given deployment. See migrations/0025_tracking_links.sql and
        // worker/tracking/health-check.js for the full reasoning --
        // this does NOT get activated just by this wiring existing; it
        // also requires both this wrangler.jsonc's cron trigger to be
        // uncommented AND the system_settings row to be set to 'true'.
        ctx.waitUntil(
            runScheduledHealthChecks(env.DB).catch(() => {
                // Never let a health-check failure affect other scheduled tasks.
            })
        );

        // Research source URL health monitoring (Research Engine Phase 5)
        // -- same feature-flag convention as the tracking-link checks
        // above ('research_source_health_cron_enabled' in
        // system_settings, default off — see
        // migrations/0049_research_review_queue.sql). Reuses the same
        // generic checkTrackingLinkHealth() classifier from
        // worker/tracking/health-check.js rather than a second
        // implementation — see worker/research/source-health.js.
        ctx.waitUntil(
            runScheduledResearchSourceHealthChecks(env.DB).catch(() => {
                // Never let a source health-check failure affect other scheduled tasks.
            })
        );

        // Analytics daily aggregation (Phase 4) -- same feature-flag
        // convention as the health checks above ('analytics_aggregation_
        // cron_enabled' in system_settings, default off). Also always
        // safe to leave wired in: a disabled flag makes this a no-op.
        ctx.waitUntil(
            runAnalyticsAggregation(env).catch(() => {
                // Never let an aggregation failure affect other scheduled tasks.
            })
        );

        // Scheduled report execution (Phase 9) -- same feature-flag
        // convention ('report_schedules_cron_enabled', default off).
        ctx.waitUntil(
            runScheduledReports(env).catch(() => {
                // Never let a report-scheduling failure affect other scheduled tasks.
            })
        );

        // Alert-rule evaluation (Phase 13) -- same feature-flag
        // convention ('alert_rules_cron_enabled', default off).
        ctx.waitUntil(
            runAlertEvaluation(env).catch(() => {
                // Never let alert evaluation affect other scheduled tasks.
            })
        );

        // Outbound provider/API adapter sync (brief §10) -- same
        // feature-flag convention ('provider_sync_cron_enabled',
        // default off -- see migration 0035). Off until an operator
        // has actually configured a real provider_adapter_configs row
        // with real credentials.
        ctx.waitUntil(
            runProviderSync(env).catch(() => {
                // Never let a provider sync failure affect other scheduled tasks.
            })
        );

        // Weekly subscriber digest (this feature) -- same feature-flag
        // convention ('weekly_digest_cron_enabled', default off). Its
        // own internal 7-day cadence check means this is a safe no-op
        // to leave wired in even while the underlying trigger fires
        // every 6 hours -- see worker/cron.js runWeeklyDigest().
        ctx.waitUntil(
            runWeeklyDigest(env).catch(() => {
                // Never let a digest failure affect other scheduled tasks.
            })
        );

        // Weekly Lummet AI chat-quality email to admins who opted in (AI Studio). Own 7-day cadence; a no-op when nobody opted in.
        ctx.waitUntil(
            runChatQualityReport(env).catch(() => {
                // Never let a report failure affect other scheduled tasks.
            })
        );

        // Keep the public page cache warm so a quiet site's first visitor is not the one who waits.
        ctx.waitUntil(
            warmPublicPages(env, (req) => (c) => appWorker.fetch(req, env, c)).catch((e) => {
                console.error("Page warm-up failed:", e && e.message);
            })
        );

    }
