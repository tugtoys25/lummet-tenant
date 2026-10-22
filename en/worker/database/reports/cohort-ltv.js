import { getAccessibleIdCondition } from '../item-access.js';
import { safeDivide } from '../analytics.js';
import { COHORT_ANALYSIS_COLUMNS, LTV_ANALYSIS_COLUMNS } from "./columns.js";

const COHORT_DIMENSION_COLUMNS = { casino: 'casino_id', geo: 'country_code', campaign: 'campaign_id' };

/**
 * brief §17. Cohort = every distinct click_id whose FIRST event of the
 * "from" conversion_type (registration for registration_to_ftd, ftd for
 * ftd_to_deposit) falls in the requested date range -- grouped by that
 * event's OWN date (`cohort_date`), not the later conversion's date, so
 * "the March 3rd cohort" always means people acquired on March 3rd
 * regardless of when they later converted.
 *
 * click_id is the only cross-conversion identifier this platform has
 * (brief §18 "use anonymous identifiers... click_id" applies here too)
 * -- a cohort is inherently approximate to that limit, and rows with a
 * NULL click_id (brief's own unattributed-conversion case) are
 * correctly excluded rather than merged into a false "no cohort" bucket.
 */
export async function handleCohortAnalysis(db, user, filters) {
  const { condition, params } = await getAccessibleIdCondition(db, user, 'casinos', 'read', 'casino_id');
  const metric = filters.cohortMetric || 'revenue_by_cohort';
  const dimColumn = COHORT_DIMENSION_COLUMNS[filters.groupByDimension] || null;
  const dimSelect = dimColumn ? `${dimColumn},` : '';
  const dimGroupBy = dimColumn ? `, ${dimColumn}` : '';

  if (metric === 'registration_to_ftd' || metric === 'ftd_to_deposit') {
    const fromType = metric === 'registration_to_ftd' ? 'registration' : 'ftd';
    const toType = metric === 'registration_to_ftd' ? 'ftd' : 'deposit';

    const result = await db.prepare(`
      WITH cohort_start AS (
        SELECT click_id, MIN(occurred_at) AS start_at, casino_id, country_code, campaign_id
        FROM analytics_conversions
        WHERE conversion_type = ? AND click_id IS NOT NULL AND ${condition}
          AND date(occurred_at) BETWEEN ? AND ?
        GROUP BY click_id
      ),
      converted AS (
        SELECT click_id, MIN(occurred_at) AS converted_at
        FROM analytics_conversions
        WHERE conversion_type = ? AND click_id IS NOT NULL
        GROUP BY click_id
      )
      SELECT
        date(cs.start_at) AS cohort_date, ${dimSelect}
        COUNT(*) AS cohort_size,
        COUNT(c.click_id) AS converted_count,
        AVG(CASE WHEN c.click_id IS NOT NULL THEN julianday(c.converted_at) - julianday(cs.start_at) END) AS avg_days_to_convert
      FROM cohort_start cs
      LEFT JOIN converted c ON c.click_id = cs.click_id AND c.converted_at >= cs.start_at
      GROUP BY cohort_date${dimGroupBy}
      ORDER BY cohort_date DESC
    `).bind(fromType, ...params, filters.startDate, filters.endDate, toType).all();

    const rows = (result.results || []).map(r => ({
      cohort_date: r.cohort_date,
      casino_id: dimColumn === 'casino_id' ? r.casino_id : null,
      country_code: dimColumn === 'country_code' ? r.country_code : null,
      campaign_id: dimColumn === 'campaign_id' ? r.campaign_id : null,
      cohort_size: r.cohort_size,
      converted_count: r.converted_count,
      conversion_rate_pct: Number((safeDivide(r.converted_count, r.cohort_size) * 100).toFixed(2)),
      avg_days_to_convert: r.avg_days_to_convert != null ? Number(r.avg_days_to_convert.toFixed(2)) : null, // null, not 0 -- brief §29: nobody in this cohort has converted yet is NOT "instant conversion"
      revenue: null,
      commission: null
    }));
    return { columns: COHORT_ANALYSIS_COLUMNS, rows };
  }

  if (metric === 'revenue_by_cohort') {
    // Acquisition = a click_id's earliest conversion of ANY type
    // (usually registration, but a program that skips straight to FTD
    // without a distinct registration event still gets a cohort).
    const result = await db.prepare(`
      WITH acquisition AS (
        SELECT click_id, MIN(occurred_at) AS acquired_at, casino_id, country_code, campaign_id
        FROM analytics_conversions
        WHERE click_id IS NOT NULL AND ${condition}
          AND date(occurred_at) BETWEEN ? AND ?
        GROUP BY click_id
      )
      SELECT
        date(a.acquired_at) AS cohort_date, ${dimSelect}
        COUNT(DISTINCT a.click_id) AS cohort_size,
        COALESCE(SUM(ac.reported_value), 0) AS revenue,
        COALESCE(SUM(ac.calculated_commission), 0) AS commission
      FROM acquisition a
      JOIN analytics_conversions ac ON ac.click_id = a.click_id
      GROUP BY cohort_date${dimGroupBy}
      ORDER BY cohort_date DESC
    `).bind(...params, filters.startDate, filters.endDate).all();

    const rows = (result.results || []).map(r => ({
      cohort_date: r.cohort_date,
      casino_id: dimColumn === 'casino_id' ? r.casino_id : null,
      country_code: dimColumn === 'country_code' ? r.country_code : null,
      campaign_id: dimColumn === 'campaign_id' ? r.campaign_id : null,
      cohort_size: r.cohort_size,
      converted_count: null,
      conversion_rate_pct: null,
      avg_days_to_convert: null,
      revenue: r.revenue,
      commission: r.commission
    }));
    return { columns: COHORT_ANALYSIS_COLUMNS, rows };
  }

  return { columns: COHORT_ANALYSIS_COLUMNS, rows: [] };
}

/**
 * brief §18. One row per external_player_id ACQUIRED (their earliest
 * conversion) within the requested date range -- same acquisition-
 * date framing as handleCohortAnalysis above, just keyed by the
 * provider's player reference instead of click_id. Revenue/commission
 * windows (7-day/30-day/to-date) look at ALL of that player's
 * conversions regardless of date, same as revenue_by_cohort.
 *
 * If this tenant has NEVER recorded a single conversion with an
 * external_player_id (no configured provider sends one), returns one
 * synthetic row explaining that plainly, with every numeric column
 * `null` -- never a fabricated empty table that looks like "zero
 * players, zero revenue" (brief §18 "if player-level data is not
 * available from a provider, do not pretend it is" / brief §29).
 * A tenant that DOES have player-level data but none acquired in the
 * requested date range gets a genuinely empty row set instead -- that
 * really is a zero, not a missing capability.
 */
export async function handleLtvAnalysis(db, user, filters) {
  const { condition, params } = await getAccessibleIdCondition(db, user, 'casinos', 'read', 'casino_id');

  const capabilityCheck = await db.prepare(`
    SELECT COUNT(*) AS c FROM analytics_conversions
    WHERE external_player_id IS NOT NULL AND ${condition}
  `).bind(...params).first();

  if (!capabilityCheck || capabilityCheck.c === 0) {
    return {
      columns: LTV_ANALYSIS_COLUMNS,
      rows: [{
        external_player_id: null, casino_id: null, first_seen_at: null,
        ftd_value: null, deposit_value: null, revenue_7d: null, revenue_30d: null,
        total_revenue: null, total_commission: null,
        note: 'No player-level data available yet -- no configured postback/import/adapter for this tenant currently sends an external player identifier.'
      }]
    };
  }

  const result = await db.prepare(`
    WITH acquisition AS (
      SELECT external_player_id, MIN(occurred_at) AS first_seen_at, casino_id
      FROM analytics_conversions
      WHERE external_player_id IS NOT NULL AND ${condition}
      GROUP BY external_player_id
    )
    SELECT
      a.external_player_id, a.casino_id, a.first_seen_at,
      COALESCE(SUM(CASE WHEN c.conversion_type = 'ftd' THEN c.reported_value ELSE 0 END), 0) AS ftd_value,
      COALESCE(SUM(CASE WHEN c.conversion_type = 'deposit' THEN c.reported_value ELSE 0 END), 0) AS deposit_value,
      COALESCE(SUM(CASE WHEN julianday(c.occurred_at) <= julianday(a.first_seen_at) + 7 THEN c.reported_value ELSE 0 END), 0) AS revenue_7d,
      COALESCE(SUM(CASE WHEN julianday(c.occurred_at) <= julianday(a.first_seen_at) + 30 THEN c.reported_value ELSE 0 END), 0) AS revenue_30d,
      COALESCE(SUM(c.reported_value), 0) AS total_revenue,
      COALESCE(SUM(c.calculated_commission), 0) AS total_commission
    FROM acquisition a
    JOIN analytics_conversions c ON c.external_player_id = a.external_player_id
    WHERE date(a.first_seen_at) BETWEEN ? AND ?
    GROUP BY a.external_player_id, a.casino_id, a.first_seen_at
    ORDER BY total_revenue DESC
  `).bind(...params, filters.startDate, filters.endDate).all();

  const rows = (result.results || []).map(r => ({ ...r, note: null }));
  return { columns: LTV_ANALYSIS_COLUMNS, rows };
}
