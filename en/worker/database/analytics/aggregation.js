// ── Scheduled aggregation (Phase 4) ─────────────────

const AGGREGATE_DIMENSIONS = [
  { type: 'casino', column: 'casino_id', hasConversions: true },
  { type: 'offer', column: 'offer_id', hasConversions: true },
  { type: 'tracking_link', column: 'tracking_link_id', hasConversions: true },
  { type: 'partner', column: 'partner_id', hasConversions: true },
  { type: 'program', column: 'program_id', hasConversions: true },
  { type: 'account', column: 'account_id', hasConversions: true },
  { type: 'campaign', column: 'campaign_id', hasConversions: true },
  // Content dimensions -- traffic only. analytics_conversions has no
  // review_id/news_id/page_id column at all (conversions only ever tie
  // to a casino/offer/tracking_link/etc.), so hasConversions: false
  // skips that query entirely rather than running it against a
  // nonexistent column.
  { type: 'review', column: 'review_id', hasConversions: false },
  { type: 'news', column: 'news_id', hasConversions: false },
  { type: 'page', column: 'page_id', hasConversions: false }
];

/**
 * Rolls one UTC calendar day of analytics_events + analytics_conversions
 * into analytics_daily, one dimension at a time. Idempotent: uses
 * INSERT ... ON CONFLICT DO UPDATE against the (date, dimension_type,
 * dimension_id, currency) unique index (0027), so re-running for the
 * same day (e.g. to pick up late-arriving conversions) overwrites
 * rather than double-counts. Feature-flagged identically to the
 * existing tracking-link health-check cron job (same
 * system_settings convention, same "no-op is always safe" contract).
 */
export async function aggregateAnalyticsDaily(db, { date = null } = {}) {
  const flag = await db.prepare(
    `SELECT value FROM system_settings WHERE key = 'analytics_aggregation_cron_enabled'`
  ).first();
  if (!flag || flag.value !== 'true') {
    return { skipped: true, reason: 'feature flag disabled' };
  }

  // Default: aggregate "yesterday" (UTC) — today is still accumulating
  // events and would produce a partial, misleadingly-final row.
  const targetDate = date || await db.prepare(`SELECT date('now', '-1 day') AS d`).first().then(r => r.d);
  const dimensions = await aggregateOneDay(db, targetDate);
  return { skipped: false, date: targetDate, dimensions };
}

async function aggregateOneDay(db, targetDate) {
  const summary = [];
  for (const dim of AGGREGATE_DIMENSIONS) {
    const rowCount = await aggregateOneDimension(db, dim, targetDate);
    summary.push({ dimension: dim.type, rows: rowCount });
  }
  return summary;
}

/**
 * Manual/admin backfill -- an explicit human action, so it deliberately
 * does NOT check 'analytics_aggregation_cron_enabled'. That flag gates
 * the AUTOMATIC schedule; an admin pressing "run now" (or backfilling
 * a range of days the flag was off for) is a different, intentional
 * action that shouldn't require the automation to also be turned on
 * first. Same idempotent per-day aggregation as the cron path --
 * re-running a date that's already aggregated overwrites, never
 * double-counts (see aggregateOneDimension's ON CONFLICT).
 *
 * Capped at 92 days per call (roughly a quarter) so a mistaken
 * multi-year range can't turn one admin click into thousands of
 * sequential queries against D1.
 */
export async function backfillAnalyticsDaily(db, { startDate, endDate }) {
  const dates = await db.prepare(`
    WITH RECURSIVE d(day) AS (
      SELECT date(?)
      UNION ALL
      SELECT date(day, '+1 day') FROM d WHERE day < date(?)
    )
    SELECT day FROM d
  `).bind(startDate, endDate).all();

  const days = (dates.results || []).map(r => r.day);
  if (days.length > 92) {
    throw new Error(`Date range too large (${days.length} days) -- backfill at most 92 days per call.`);
  }

  const perDay = [];
  for (const day of days) {
    const dimensions = await aggregateOneDay(db, day);
    perDay.push({ date: day, dimensions });
  }
  return { daysProcessed: perDay.length, perDay };
}

/**
 * Aggregates ONE dimension for ONE day. Two independent GROUP BY
 * queries (traffic from analytics_events, money from
 * analytics_conversions) merged in JS by (dimensionId, currency) —
 * deliberately NOT a single JOIN'd query, because joining events to
 * conversions on click_id before aggregating would fan out and
 * double- (or triple-) count page_views/clicks for any dimension
 * value that had more than one conversion that day.
 */
async function aggregateOneDimension(db, dim, targetDate) {
  const traffic = await db.prepare(`
    SELECT
      ${dim.column} AS dimension_id,
      COUNT(*) FILTER (WHERE event_type IN ('PAGE_VIEW','CASINO_VIEW','REVIEW_VIEW','OFFER_VIEW','CONTENT_VIEW')) AS page_views,
      COUNT(*) FILTER (WHERE event_type IN ('TRACKING_LINK_CLICK','OFFER_CLICK','AFFILIATE_REDIRECT','OUTBOUND_CLICK')) AS clicks,
      COUNT(DISTINCT CASE WHEN event_type IN ('TRACKING_LINK_CLICK','OFFER_CLICK','AFFILIATE_REDIRECT','OUTBOUND_CLICK')
                          THEN visitor_hash END) AS unique_clicks
    FROM analytics_events
    WHERE date(occurred_at) = ?
      AND ${dim.column} IS NOT NULL
      AND is_bot = 0
      AND is_duplicate = 0
    GROUP BY ${dim.column}
  `).bind(targetDate).all();

  const money = dim.hasConversions ? await db.prepare(`
    SELECT
      ${dim.column} AS dimension_id,
      currency,
      COUNT(*) AS conversions,
      COALESCE(SUM(reported_value), 0) AS revenue,
      COALESCE(SUM(calculated_commission), 0) AS commission
    FROM analytics_conversions
    WHERE date(occurred_at) = ?
      AND ${dim.column} IS NOT NULL
      AND status != 'rejected'
    GROUP BY ${dim.column}, currency
  `).bind(targetDate).all() : { results: [] };

  // Merge keyed by dimensionId + currency. A dimension with traffic
  // but no conversions that day still gets a row (currency defaults
  // to 'USD' per the analytics_daily UNIQUE index) rather than being
  // silently dropped.
  const byKey = new Map();
  for (const t of traffic.results || []) {
    byKey.set(`${t.dimension_id}::USD`, {
      dimensionId: t.dimension_id, currency: 'USD',
      pageViews: t.page_views, clicks: t.clicks, uniqueClicks: t.unique_clicks,
      conversions: 0, revenue: 0, commission: 0
    });
  }
  for (const m of money.results || []) {
    const key = `${m.dimension_id}::${m.currency}`;
    const existing = byKey.get(key) || {
      dimensionId: m.dimension_id, currency: m.currency,
      pageViews: 0, clicks: 0, uniqueClicks: 0, conversions: 0, revenue: 0, commission: 0
    };
    existing.conversions = m.conversions;
    existing.revenue = m.revenue;
    existing.commission = m.commission;
    byKey.set(key, existing);
  }

  for (const row of byKey.values()) {
    await db.prepare(`
      INSERT INTO analytics_daily (
        date, dimension_type, dimension_id, page_views, clicks,
        unique_clicks, conversions, revenue, commission, currency, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(date, dimension_type, dimension_id, currency) DO UPDATE SET
        page_views = excluded.page_views,
        clicks = excluded.clicks,
        unique_clicks = excluded.unique_clicks,
        conversions = excluded.conversions,
        revenue = excluded.revenue,
        commission = excluded.commission,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      targetDate, dim.type, row.dimensionId, row.pageViews, row.clicks,
      row.uniqueClicks, row.conversions, row.revenue, row.commission, row.currency
    ).run();
  }

  return byKey.size;
}
