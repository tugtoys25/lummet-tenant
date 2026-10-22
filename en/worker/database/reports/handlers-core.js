import { getAccessibleIdCondition } from '../item-access.js';
import { getDimensionPerformance, getTimeSeries, getGeoPerformance, safeDivide } from '../analytics.js';
import { AFFILIATE_PERFORMANCE_COLUMNS, CONTENT_PERFORMANCE_COLUMNS, CONVERSION_FUNNEL_COLUMNS, DIMENSION_REPORT_COLUMNS, EXECUTIVE_PERFORMANCE_COLUMNS, GEO_PERFORMANCE_COLUMNS, REVENUE_COMMISSION_COLUMNS, TRAFFIC_PERFORMANCE_COLUMNS } from "./columns.js";

// ── Handlers: each returns { columns: [{key,label}], rows: [plain objects] } ──

export async function handleDimensionReport(db, user, filters, dimensionType, label) {
  const rows = await getDimensionPerformance(db, user, { dimensionType, ...filters });
  return { columns: DIMENSION_REPORT_COLUMNS(label), rows };
}

export async function handleAffiliatePerformance(db, user, filters) {
  const [partners, programs, accounts] = await Promise.all([
    getDimensionPerformance(db, user, { dimensionType: 'partner', ...filters }),
    getDimensionPerformance(db, user, { dimensionType: 'program', ...filters }),
    getDimensionPerformance(db, user, { dimensionType: 'account', ...filters })
  ]);
  const rows = [
    ...partners.map(r => ({ level: 'partner', ...r })),
    ...programs.map(r => ({ level: 'program', ...r })),
    ...accounts.map(r => ({ level: 'account', ...r }))
  ];
  return { columns: AFFILIATE_PERFORMANCE_COLUMNS, rows };
}

export async function handleGeoPerformance(db, user, filters) {
  const rows = await getGeoPerformance(db, user, filters);
  return { columns: GEO_PERFORMANCE_COLUMNS, rows };
}

export async function handleContentPerformance(db, user, filters) {
  const [reviews, news, pages] = await Promise.all([
    getDimensionPerformance(db, user, { dimensionType: 'review', ...filters }),
    getDimensionPerformance(db, user, { dimensionType: 'news', ...filters }),
    getDimensionPerformance(db, user, { dimensionType: 'page', ...filters })
  ]);
  const rows = [
    ...reviews.map(r => ({ contentType: 'review', ...r })),
    ...news.map(r => ({ contentType: 'news', ...r })),
    ...pages.map(r => ({ contentType: 'page', ...r }))
  ];
  return { columns: CONTENT_PERFORMANCE_COLUMNS, rows };
}

export async function handleTrafficPerformance(db, user, filters) {
  const [casino, review, news, page] = await Promise.all([
    getTimeSeries(db, user, { dimensionType: 'casino', ...filters }),
    getTimeSeries(db, user, { dimensionType: 'review', ...filters }),
    getTimeSeries(db, user, { dimensionType: 'news', ...filters }),
    getTimeSeries(db, user, { dimensionType: 'page', ...filters })
  ]);
  const byDate = new Map();
  for (const series of [casino, review, news, page]) {
    for (const point of series) {
      const existing = byDate.get(point.date) || { date: point.date, views: 0, clicks: 0, conversions: 0, revenue: 0, commission: 0 };
      existing.views += point.views || 0;
      existing.clicks += point.clicks || 0;
      existing.conversions += point.conversions || 0;
      existing.revenue += point.revenue || 0;
      existing.commission += point.commission || 0;
      byDate.set(point.date, existing);
    }
  }
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({ ...r, ctr: safeDivide(r.clicks, r.views) }));
  return { columns: TRAFFIC_PERFORMANCE_COLUMNS, rows };
}

export async function handleExecutivePerformance(db, user, filters) {
  const casinoRows = await getDimensionPerformance(db, user, { dimensionType: 'casino', ...filters });
  const totals = casinoRows.reduce((acc, r) => ({
    views: acc.views + r.views, clicks: acc.clicks + r.clicks,
    conversions: acc.conversions + r.conversions, revenue: acc.revenue + r.revenue,
    commission: acc.commission + r.commission
  }), { views: 0, clicks: 0, conversions: 0, revenue: 0, commission: 0 });

  const contentTotals = await handleTrafficPerformance(db, user, filters);
  const contentViews = contentTotals.rows.reduce((sum, r) => sum + (r.views || 0), 0);
  // Note: contentViews intentionally double-counts casino views already
  // present in `totals.views` above (traffic_performance sums casino+
  // review+news+page together) -- this row is presented separately as
  // "all content views (any type)" rather than merged into the casino
  // KPI row, to avoid silently conflating the two in one number.

  return {
    columns: EXECUTIVE_PERFORMANCE_COLUMNS,
    rows: [
      { metric: 'Casino Views', value: totals.views },
      { metric: 'Affiliate Clicks', value: totals.clicks },
      { metric: 'Conversions', value: totals.conversions },
      { metric: 'Revenue', value: totals.revenue },
      { metric: 'Commission', value: totals.commission },
      { metric: 'CTR', value: safeDivide(totals.clicks, totals.views) },
      { metric: 'CVR', value: safeDivide(totals.conversions, totals.clicks) },
      { metric: 'All Content Views (casinos+reviews+news+pages)', value: contentViews }
    ]
  };
}

export async function handleConversionFunnel(db, user, filters) {
  const { condition, params } = await getAccessibleIdCondition(db, user, 'casinos', 'read', 'casino_id');

  // Two independent queries merged in JS, NOT a JOIN -- joining
  // analytics_events to analytics_conversions on click_id before
  // counting would fan out (a click_id with more than one conversion
  // that day would multiply the view/click counts), the same
  // double-counting risk already documented and avoided in
  // aggregateOneDimension() above.
  const traffic = await db.prepare(`
    SELECT
      casino_id,
      COUNT(*) FILTER (WHERE event_type = 'CASINO_VIEW') AS views,
      COUNT(*) FILTER (WHERE event_type IN ('TRACKING_LINK_CLICK','OFFER_CLICK','AFFILIATE_REDIRECT','OUTBOUND_CLICK')) AS clicks
    FROM analytics_events
    WHERE date(occurred_at) BETWEEN ? AND ?
      AND ${condition}
      AND casino_id IS NOT NULL
    GROUP BY casino_id
  `).bind(filters.startDate, filters.endDate, ...params).all();

  const conversionCond = await getAccessibleIdCondition(db, user, 'casinos', 'read', 'casino_id');
  const conversions = await db.prepare(`
    SELECT casino_id, COUNT(*) AS conversions
    FROM analytics_conversions
    WHERE date(occurred_at) BETWEEN ? AND ?
      AND ${conversionCond.condition}
      AND casino_id IS NOT NULL
      AND status != 'rejected'
    GROUP BY casino_id
  `).bind(filters.startDate, filters.endDate, ...conversionCond.params).all();

  const conversionsByCasino = new Map((conversions.results || []).map(r => [r.casino_id, r.conversions]));

  const rows = (traffic.results || []).map(r => {
    const conv = conversionsByCasino.get(r.casino_id) || 0;
    return {
      casinoId: r.casino_id, views: r.views, clicks: r.clicks, conversions: conv,
      viewToClick: safeDivide(r.clicks, r.views), clickToConversion: safeDivide(conv, r.clicks)
    };
  });
  return { columns: CONVERSION_FUNNEL_COLUMNS, rows };
}

export async function handleRevenueCommission(db, user, filters) {
  const { condition, params } = await getAccessibleIdCondition(db, user, 'casinos', 'read', 'casino_id');
  const currencyClause = filters.currency ? 'AND currency = ?' : '';
  const result = await db.prepare(`
    SELECT
      casino_id, currency, status,
      COUNT(*) AS conversions,
      COALESCE(SUM(reported_value), 0) AS revenue,
      COALESCE(SUM(calculated_commission), 0) AS commission
    FROM analytics_conversions
    WHERE date(occurred_at) BETWEEN ? AND ?
      AND ${condition}
      ${currencyClause}
    GROUP BY casino_id, currency, status
    ORDER BY revenue DESC
  `).bind(filters.startDate, filters.endDate, ...params, ...(filters.currency ? [filters.currency] : [])).all();

  return { columns: REVENUE_COMMISSION_COLUMNS, rows: result.results || [] };
}
