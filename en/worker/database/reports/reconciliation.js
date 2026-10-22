import { getAccessibleIdCondition } from '../item-access.js';
import { safeDivide } from '../analytics.js';
import { RECONCILIATION_COLUMNS } from "./columns.js";

const RECONCILIATION_TOLERANCE_PCT = 2;

 // brief §12: configurable threshold for "matched" vs a real discrepancy

/**
 * Compares two channels of the SAME analytics_conversions table --
 * source IN ('postback','manual') is "INTERNAL EXPECTED" (what this
 * platform itself received/recorded, commission always our own
 * calculated_commission), source = 'import' is "EXTERNAL REPORTED"
 * (a batch statement, carrying the network's own reported_commission)
 * -- see migration 0034 for why both can coexist for the same
 * external_reference. Never invents a reported figure: a scope/period
 * with zero import rows gets status 'missing', not a fabricated
 * 'overpaid'/'underpaid' comparison against a real zero (brief §29).
 *
 * Clicks are joined in separately from analytics_events, scoped by
 * casino only (tracking_links carries no account_id -- see
 * worker/postback/ingest.js header comment) -- if more than one
 * account serves the same casino, each of that casino's reconciliation
 * rows shows the SAME click count, which is a real limitation of the
 * current schema, not silently hidden here.
 */
export async function handleReconciliation(db, user, filters) {
  const { condition, params } = await getAccessibleIdCondition(db, user, 'affiliate_accounts', 'read', 'account_id');
  const currencyClause = filters.currency ? 'AND currency = ?' : '';
  const currencyParams = filters.currency ? [filters.currency] : [];

  const conversionRows = await db.prepare(`
    SELECT
      account_id, casino_id, currency,
      COUNT(*) FILTER (WHERE source IN ('postback','manual')) AS internal_conversions,
      COUNT(*) FILTER (WHERE source IN ('postback','manual') AND conversion_type = 'registration') AS registrations,
      COUNT(*) FILTER (WHERE source IN ('postback','manual') AND conversion_type = 'ftd') AS ftd,
      COUNT(*) FILTER (WHERE source IN ('postback','manual') AND conversion_type = 'deposit') AS deposits,
      COUNT(*) FILTER (WHERE source IN ('postback','manual') AND click_id IS NULL) AS unattributed_conversions,
      COALESCE(SUM(reported_value) FILTER (WHERE source IN ('postback','manual')), 0) AS internal_revenue,
      COALESCE(SUM(calculated_commission) FILTER (WHERE source IN ('postback','manual')), 0) AS expected_commission,
      COUNT(*) FILTER (WHERE source = 'import') AS reported_conversions,
      COALESCE(SUM(reported_value) FILTER (WHERE source = 'import'), 0) AS reported_revenue,
      COALESCE(SUM(reported_commission) FILTER (WHERE source = 'import'), 0) AS reported_commission
    FROM analytics_conversions
    WHERE date(occurred_at) BETWEEN ? AND ?
      AND ${condition}
      ${currencyClause}
    GROUP BY account_id, casino_id, currency
  `).bind(filters.startDate, filters.endDate, ...params, ...currencyParams).all();

  const rows = conversionRows.results || [];
  if (rows.length === 0) return { columns: RECONCILIATION_COLUMNS, rows: [] };

  // Clicks per casino, scoped by the casino resource (the registry
  // this platform actually uses for tracking_links/analytics_events --
  // see item-access.js), for exactly the casino_ids the query above
  // already found the caller has commercial-terms access to.
  const casinoIds = [...new Set(rows.map(r => r.casino_id).filter(id => id != null))];
  let clicksByCasino = {};
  if (casinoIds.length > 0) {
    const { condition: casinoCond, params: casinoParams } = await getAccessibleIdCondition(db, user, 'casinos', 'read', 'casino_id');
    const placeholders = casinoIds.map(() => '?').join(',');
    const clickRows = await db.prepare(`
      SELECT casino_id, COUNT(*) AS clicks
      FROM analytics_events
      WHERE event_type = 'TRACKING_LINK_CLICK'
        AND casino_id IN (${placeholders})
        AND date(occurred_at) BETWEEN ? AND ?
        AND ${casinoCond}
      GROUP BY casino_id
    `).bind(...casinoIds, filters.startDate, filters.endDate, ...casinoParams).all();
    clicksByCasino = Object.fromEntries((clickRows.results || []).map(r => [r.casino_id, r.clicks]));
  }

  const outputRows = rows.map(r => {
    const hasReportedData = r.reported_conversions > 0;
    const difference = hasReportedData ? r.expected_commission - r.reported_commission : null;
    const differencePct = hasReportedData ? safeDivide(difference, r.reported_commission) * 100 : null;

    let status;
    if (!hasReportedData) {
      status = r.expected_commission > 0 ? 'missing' : 'no_data';
    } else if (Math.abs(differencePct) <= RECONCILIATION_TOLERANCE_PCT) {
      status = 'matched';
    } else if (difference > 0) {
      status = 'underpaid'; // we expect more than the network reported
    } else {
      status = 'overpaid'; // the network reported more than we expect
    }

    return {
      account_id: r.account_id,
      casino_id: r.casino_id,
      currency: r.currency,
      clicks: clicksByCasino[r.casino_id] || 0,
      registrations: r.registrations,
      ftd: r.ftd,
      deposits: r.deposits,
      unattributed_conversions: r.unattributed_conversions,
      internal_revenue: r.internal_revenue,
      expected_commission: r.expected_commission,
      reported_revenue: hasReportedData ? r.reported_revenue : null,
      reported_commission: hasReportedData ? r.reported_commission : null,
      difference,
      difference_pct: differencePct != null ? Number(differencePct.toFixed(2)) : null,
      status
    };
  });

  return { columns: RECONCILIATION_COLUMNS, rows: outputRows };
}
