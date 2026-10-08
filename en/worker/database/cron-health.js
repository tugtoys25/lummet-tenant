// Tracks whether this Worker's scheduled() handler is actually being
// invoked by Cloudflare at all, and whether each job's own
// system_settings feature flag is on -- two independent failure modes
// that look identical from the dashboard ("the numbers are zero") but
// need completely different fixes (wrangler.jsonc's commented-out
// `triggers.crons` block vs. a feature flag with no default row).
//
// Reuses system_settings (the same key-value store every cron feature
// flag already lives in) rather than a new table -- one row per job
// for "when did it last actually run", keyed `${jobKey}_last_run_at`,
// plus `${jobKey}_last_result_json` for a short summary. Written by
// recordCronRun() at the end of each wrapped function in worker/cron.js,
// for EVERY invocation -- including ones the job's own flag caused it
// to skip -- so "this row has never been written, ever" unambiguously
// means the scheduled trigger itself never fired, not that the job
// chose not to do anything that time.

export const CRON_JOBS = [
  { key: 'analytics_aggregation', flagKey: 'analytics_aggregation_cron_enabled', label: 'Analytics Aggregation', expectedIntervalHours: 6 },
  { key: 'alert_evaluation', flagKey: 'alert_rules_cron_enabled', label: 'Alert Evaluation', expectedIntervalHours: 6 },
  { key: 'provider_sync', flagKey: 'provider_sync_cron_enabled', label: 'Provider API Sync', expectedIntervalHours: 6 },
  { key: 'report_schedules', flagKey: 'report_schedules_cron_enabled', label: 'Scheduled Reports', expectedIntervalHours: 6 },
  { key: 'weekly_digest', flagKey: 'weekly_digest_cron_enabled', label: 'Weekly Subscriber Digest', expectedIntervalHours: 6 }
];

/**
 * Best-effort, like every other logging call in this codebase (see
 * worker/database/audit.js logAudit) -- recording that a cron job ran
 * must never be the thing that makes the cron job itself fail.
 */
export async function recordCronRun(db, jobKey, result) {
  try {
    const now = new Date().toISOString();
    // Trim to a short, dashboard-safe summary -- never store a full
    // per-row dump (e.g. provider sync's per-config results) that
    // could grow unbounded in a key/value table meant for small flags.
    const summary = {
      skipped: !!result?.skipped,
      reason: result?.reason ?? null,
      at: now
    };
    if (jobKey === 'analytics_aggregation' && !result?.skipped) summary.date = result.date;
    if (jobKey === 'provider_sync' && !result?.skipped) summary.synced = result.synced;
    if (jobKey === 'alert_evaluation' && !result?.skipped) summary.triggered = (result.summary || []).filter(s => s.triggered).length;
    if (jobKey === 'report_schedules' && !result?.skipped) summary.ran = (result.results || []).length;

    await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`)
      .bind(`${jobKey}_last_run_at`, now).run();
    await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`)
      .bind(`${jobKey}_last_result_json`, JSON.stringify(summary)).run();
  } catch (_) {
    // Never let health tracking break the actual job.
  }
}

/**
 * Powers the admin health indicator. For each known job:
 *   'never_run' -- no last_run_at row exists at all. The scheduled()
 *                  handler has never invoked this job, full stop --
 *                  almost always means wrangler.jsonc's triggers.crons
 *                  is missing/commented out, not a flag problem.
 *   'disabled'  -- it HAS run, but the job's own feature flag is off,
 *                  so it's intentionally a no-op every time.
 *   'stale'     -- flag is on, but the last run is older than ~2x its
 *                  expected interval -- the trigger may have stopped
 *                  firing (or D1/the job itself is erroring silently).
 *   'ok'        -- flag is on and it ran recently.
 */
export async function getCronHealth(db) {
  const keys = CRON_JOBS.flatMap(j => [j.flagKey, `${j.key}_last_run_at`, `${j.key}_last_result_json`]);
  const placeholders = keys.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT key, value FROM system_settings WHERE key IN (${placeholders})`).bind(...keys).all();
  const settings = Object.fromEntries((rows.results || []).map(r => [r.key, r.value]));

  const now = Date.now();
  return CRON_JOBS.map(job => {
    const enabled = settings[job.flagKey] === 'true';
    const lastRunAt = settings[`${job.key}_last_run_at`] || null;
    let lastResult = null;
    try { lastResult = settings[`${job.key}_last_result_json`] ? JSON.parse(settings[`${job.key}_last_result_json`]) : null; } catch { /* leave null on malformed JSON rather than throw */ }

    let status;
    if (!lastRunAt) {
      status = 'never_run';
    } else if (!enabled) {
      status = 'disabled';
    } else {
      const hoursSince = (now - new Date(lastRunAt).getTime()) / (1000 * 60 * 60);
      status = hoursSince > job.expectedIntervalHours * 2 ? 'stale' : 'ok';
    }

    return { key: job.key, label: job.label, enabled, lastRunAt, lastResult, status };
  });
}
