// =====================================================
// RESEARCH ENGINE — Phase 5: source URL health checks
//
// Deliberately does NOT reimplement redirect-following/timeout/
// classification logic — that already exists, generically (it
// takes a bare URL, not a tracking-link row), in
// worker/tracking/health-check.js. This module only adds the
// research_sources-specific plumbing: which sources to check,
// and what to do with the result.
//
// Same restraint as the existing checker: a 403/429/451
// ("restricted") is NOT treated as broken — a regulator site
// blocking automated requests doesn't mean the source is dead,
// and flagging it as broken would train editors to ignore the
// review queue.
// =====================================================

import { checkTrackingLinkHealth } from "../tracking/health-check.js";

/** Runs a health check for one source and updates its status in place — no separate history table, same "current snapshot" approach research_sources.status already uses. */
export async function checkAndRecordSourceHealth(db, source, opts = {}) {
  if (!source.url) {
    return { skipped: true, reason: "no URL to check" };
  }

  const result = await checkTrackingLinkHealth(source.url, opts);

  // 'restricted' and 'warning' both mean "still reachable" — only
  // a confirmed 'broken' or 'timeout' result should flip an
  // otherwise-active source to broken.
  const newStatus = (result.healthStatus === "broken" || result.healthStatus === "timeout")
    ? "broken"
    : (source.status === "broken" ? "active" : source.status); // a previously-broken source that now resolves is un-flagged

  await db.prepare(`
    UPDATE research_sources SET status = ?, accessed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(newStatus, source.id).run();

  return { ...result, previousStatus: source.status, newStatus };
}

/**
 * Batch entry point for the scheduled task, same feature-flag
 * convention as runScheduledHealthChecks() in the tracking-link
 * module ('research_source_health_cron_enabled' in system_settings,
 * default off).
 */
export async function runScheduledResearchSourceHealthChecks(db, { batchSize = 20, staleAfterHours = 24 * 14 } = {}) {
  const flag = await db.prepare(`SELECT value FROM system_settings WHERE key = 'research_source_health_cron_enabled'`).first();
  if (!flag || flag.value !== "true") {
    return { skipped: true, reason: "feature flag disabled" };
  }

  const stale = await db.prepare(`
    SELECT * FROM research_sources
    WHERE status != 'archived'
      AND (accessed_at IS NULL OR accessed_at < datetime('now', ?))
    ORDER BY accessed_at ASC
    LIMIT ?
  `).bind(`-${staleAfterHours} hours`, batchSize).all();

  const sources = stale.results || [];
  const results = [];
  for (const source of sources) {
    try {
      const result = await checkAndRecordSourceHealth(db, source);
      results.push({ id: source.id, ...result });
    } catch (err) {
      results.push({ id: source.id, error: err.message });
    }
  }
  return { skipped: false, checked: results.length, results };
}
