import { getAccessibleIdCondition } from '../item-access.js';

// ── Safe KPI math (audit §8 / brief §8: never NaN/Infinity) ───────

/**
 * Divides a/b, returning 0 (not NaN or Infinity) when b is 0, null,
 * or undefined. Every ratio metric in this module goes through this.
 */
export function safeDivide(a, b) {
  const numerator = Number(a) || 0;
  const denominator = Number(b) || 0;
  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Computes the standard KPI set from raw dimension totals.
 * Definitions (documented once here — see also docs/analytics.md):
 *   CTR = clicks / views
 *   CVR = conversions / clicks
 *   EPC = commission / clicks           (earnings per click)
 *   RPC = revenue / clicks              (revenue per click)
 *   CPA = commission / conversions      (average cost/earning per acquisition)
 *   RPM = (revenue / views) * 1000      (revenue per thousand views)
 */
export function computeKpis({ views = 0, clicks = 0, conversions = 0, revenue = 0, commission = 0 }) {
  return {
    views, clicks, conversions, revenue, commission,
    ctr: safeDivide(clicks, views),
    cvr: safeDivide(conversions, clicks),
    epc: safeDivide(commission, clicks),
    rpc: safeDivide(revenue, clicks),
    cpa: safeDivide(commission, conversions),
    rpm: safeDivide(revenue, views) * 1000
  };
}

// ── Scoped dimension resolution ─────────────────────

// Maps an analytics dimension name to the item-access resource that
// governs it. Kept as one small table so adding a new scoped
// dimension later is a one-line change, not a new code path.
const DIMENSION_RESOURCE_MAP = {
  casino: 'casinos',
  offer: 'offers',
  tracking_link: 'tracking_links',
  partner: 'affiliate_partners',
  program: 'affiliate_programs',
  account: 'affiliate_accounts',
  campaign: 'campaigns',
  // Content dimensions (added for Phase 7-9 content/traffic reporting).
  // Unlike casino/offer/etc., these aren't affiliate-revenue dimensions
  // -- they carry page_views only (conversions/revenue stay 0 for these
  // rows, which computeKpis already handles safely via safeDivide).
  review: 'reviews',
  news: 'news',
  page: 'pages'
};

/**
 * Resolves the WHERE-clause fragment restricting rows in a table
 * where `idColumn` holds a dimension's ID (analytics_daily.dimension_id,
 * or analytics_events.casino_id / offer_id / etc.) to what `user` is
 * permitted to see for a given dimension_type, via the shared
 * getAccessibleIdCondition() in item-access.js — same scope
 * resolution (`all`/`none`/`own`/`assigned`) used everywhere else in
 * the app, just pointed at the correct column name for this table.
 *
 * `country`, `content`, and `overall` dimension types have no
 * item-access resource registered (there is no per-country or
 * per-page ownership model in this codebase) and are intentionally
 * NOT included in DIMENSION_RESOURCE_MAP — callers requesting those
 * dimension types get an always-true '1=1' condition by design,
 * matching how country/page data is already surfaced elsewhere in
 * the admin dashboard today. If that changes, add the mapping here —
 * do not special-case it at each call site.
 */
export async function getScopedDimensionCondition(db, user, dimensionType, idColumn = 'dimension_id') {
  const resource = DIMENSION_RESOURCE_MAP[dimensionType];
  if (!resource) return { condition: '1=1', params: [] };

  return await getAccessibleIdCondition(db, user, resource, 'read', idColumn);
}

// ── KPI queries (read analytics_daily — never raw analytics_events
//    for ranges wider than "today", per audit §8 performance risk #5) ──

/**
 * Overview KPIs for a date range, permission-scoped, for ONE
 * dimension_type at a time (e.g. all casinos the user can see).
 * Returns per-dimension rows plus totals. Never accepts an unscoped
 * dimension_type without going through getScopedDimensionCondition.
 */
export async function getDimensionPerformance(db, user, { dimensionType, startDate, endDate, currency = null }) {
  const { condition, params } = await getScopedDimensionCondition(db, user, dimensionType);

  const currencyClause = currency ? 'AND currency = ?' : '';
  const bindParams = [dimensionType, startDate, endDate, ...params, ...(currency ? [currency] : [])];

  const result = await db.prepare(`
    SELECT
      dimension_id,
      currency,
      SUM(page_views) AS views,
      SUM(clicks) AS clicks,
      SUM(unique_clicks) AS unique_clicks,
      SUM(conversions) AS conversions,
      SUM(revenue) AS revenue,
      SUM(commission) AS commission
    FROM analytics_daily
    WHERE dimension_type = ?
      AND date BETWEEN ? AND ?
      AND ${condition}
      ${currencyClause}
    GROUP BY dimension_id, currency
    ORDER BY revenue DESC
  `).bind(...bindParams).all();

  const rows = (result.results || []).map(r => ({
    dimensionId: r.dimension_id,
    currency: r.currency,
    ...computeKpis({
      views: r.views, clicks: r.clicks, conversions: r.conversions,
      revenue: r.revenue, commission: r.commission
    })
  }));

  return rows;
}

/**
 * Daily time-series for a single dimension_type + optional single
 * dimension_id, permission-scoped identically to getDimensionPerformance.
 */
export async function getTimeSeries(db, user, { dimensionType, dimensionId = null, startDate, endDate, currency = null }) {
  const { condition, params } = await getScopedDimensionCondition(db, user, dimensionType);

  const idClause = dimensionId != null ? 'AND dimension_id = ?' : '';
  const currencyClause = currency ? 'AND currency = ?' : '';
  const bindParams = [
    dimensionType, startDate, endDate, ...params,
    ...(dimensionId != null ? [dimensionId] : []),
    ...(currency ? [currency] : [])
  ];

  const result = await db.prepare(`
    SELECT
      date,
      SUM(page_views) AS views,
      SUM(clicks) AS clicks,
      SUM(conversions) AS conversions,
      SUM(revenue) AS revenue,
      SUM(commission) AS commission
    FROM analytics_daily
    WHERE dimension_type = ?
      AND date BETWEEN ? AND ?
      AND ${condition}
      ${idClause}
      ${currencyClause}
    GROUP BY date
    ORDER BY date ASC
  `).bind(...bindParams).all();

  return (result.results || []).map(r => ({
    date: r.date,
    ...computeKpis({
      views: r.views, clicks: r.clicks, conversions: r.conversions,
      revenue: r.revenue, commission: r.commission
    })
  }));
}

/**
 * GEO breakdown. `country` has no item-access resource (see
 * DIMENSION_RESOURCE_MAP note above) so this instead scopes by
 * casino — a user can only see country rows for casinos they're
 * permitted to see — which is the actual leakage vector the brief's
 * §18 example describes ("infer Casino C revenue through aggregate
 * reports" — here, through a GEO report).
 */
export async function getGeoPerformance(db, user, { startDate, endDate, currency = null }) {
  const { condition, params } = await getAccessibleIdCondition(db, user, 'casinos', 'read', 'casino_id');

  // GEO rows are stored per-casino in analytics_daily only when
  // dimension_type = 'country' AND a companion casino_id-scoped join
  // exists; since analytics_daily is a flat dimension table (one
  // dimension per row, see 0027 design note), country x casino
  // breakdowns are read from analytics_events/analytics_conversions
  // directly for the requested range instead — acceptable per audit §8
  // because GEO reports are a bounded, explicitly-date-ranged admin
  // action, not a page-render-path query.
  //
  // Two independent queries merged in JS below, NOT a JOIN — joining
  // events to conversions on click_id before aggregating fans out
  // whenever a single click_id has more than one same-day conversion
  // (e.g. a registration AND an FTD off the same click), which would
  // silently inflate the click COUNT for that country. Same bug class
  // already fixed in aggregateOneDimension() and handleConversionFunnel().
  const traffic = await db.prepare(`
    SELECT
      country_code,
      COUNT(*) FILTER (WHERE event_type IN ('TRACKING_LINK_CLICK','OFFER_CLICK','AFFILIATE_REDIRECT')) AS clicks
    FROM analytics_events
    WHERE date(occurred_at) BETWEEN ? AND ?
      AND ${condition}
    GROUP BY country_code
  `).bind(startDate, endDate, ...params).all();

  const moneyCond = await getAccessibleIdCondition(db, user, 'casinos', 'read', 'casino_id');
  const currencyClause = currency ? 'AND currency = ?' : '';
  const money = await db.prepare(`
    SELECT
      country_code,
      COUNT(*) AS conversions,
      COALESCE(SUM(reported_value), 0) AS revenue,
      COALESCE(SUM(calculated_commission), 0) AS commission
    FROM analytics_conversions
    WHERE date(occurred_at) BETWEEN ? AND ?
      AND ${moneyCond.condition}
      AND status != 'rejected'
      ${currencyClause}
    GROUP BY country_code
  `).bind(startDate, endDate, ...moneyCond.params, ...(currency ? [currency] : [])).all();

  const moneyByCountry = new Map((money.results || []).map(r => [r.country_code, r]));

  return (traffic.results || []).map(r => {
    const m = moneyByCountry.get(r.country_code) || { conversions: 0, revenue: 0, commission: 0 };
    return {
      country: r.country_code,
      ...computeKpis({ views: 0, clicks: r.clicks, conversions: m.conversions, revenue: m.revenue, commission: m.commission })
    };
  });
}
