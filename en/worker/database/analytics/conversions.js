import { resolveApplicableTerm, calculateCommission } from '../affiliate-commercial-terms.js';

// pending < confirmed < rejected. A rejected conversion is final; confirmed can still be rejected (a later chargeback-style reversal sent
// under the same reference), but never goes back to pending.
const STATUS_RANK = { pending: 0, confirmed: 1, rejected: 2 };
const rank = (s) => (s in STATUS_RANK ? STATUS_RANK[s] : 0);

// ISO 8601 / "YYYY-MM-DD HH:MM:SS" -> the SQLite datetime text the rest of the table uses (UTC). null stays null (DB default = now).
function toSqlTime(v) {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString().replace('T', ' ').slice(0, 19);
}

async function updateExistingConversion(db, { accountId, externalReference, source, status, reportedValue, reportedCommission, calculatedCommission, termId }) {
  const row = await db.prepare(`
    SELECT id, status, reported_value, reported_commission FROM analytics_conversions
    WHERE account_id IS ? AND external_reference = ? AND source = ? LIMIT 1
  `).bind(accountId ?? null, externalReference, source).first();
  if (!row) return { updated: false, id: null };

  const nextStatus = rank(status) > rank(row.status) ? status : row.status;
  const valueChanged = reportedValue != null && reportedValue !== row.reported_value;
  const commissionChanged = reportedCommission != null && reportedCommission !== row.reported_commission;
  if (nextStatus === row.status && !valueChanged && !commissionChanged) return { updated: false, id: row.id };

  await db.prepare(`
    UPDATE analytics_conversions SET
      status = ?,
      reported_value = COALESCE(?, reported_value),
      reported_commission = COALESCE(?, reported_commission),
      calculated_commission = CASE WHEN ? IS NOT NULL THEN ? ELSE calculated_commission END,
      commercial_term_id = COALESCE(?, commercial_term_id),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    nextStatus,
    valueChanged ? reportedValue : null,
    commissionChanged ? reportedCommission : null,
    valueChanged ? 1 : null, valueChanged ? calculatedCommission : null,
    valueChanged ? termId : null,
    row.id
  ).run();
  return { updated: true, id: row.id };
}

// ── Conversion recording (Phase 3) ──────────────────

/**
 * Records a conversion. Looks up the applicable commercial_term
 * itself (never trusts a caller-supplied commission figure) via the
 * shared resolveApplicableTerm() resolver in
 * affiliate-commercial-terms.js -- the SAME resolver the commercial
 * terms admin UI uses, so this never drifts out of sync with the
 * documented 8-level GEO-aware specificity hierarchy (account+casino+
 * geo down to program-only). geoCode is optional -- omitting it just
 * means only geo-less terms are eligible, same as before this existed.
 *
 * `status` defaults to 'pending' for the manual/admin entry point
 * (unchanged behavior), but the postback pipeline
 * (worker/postback/ingest.js) passes whatever status the network
 * itself reported (many networks confirm FTDs synchronously).
 *
 * `onDuplicate` controls what happens when the (account_id,
 * external_reference) UNIQUE constraint (0028) rejects a second
 * postback for a conversion already recorded:
 *   'throw'  (default) -- existing admin-entry behavior, unchanged.
 *   'ignore' -- returns { duplicate: true } instead of throwing, for
 *              the postback endpoint, which must respond 200 to a
 *              legitimately retried/replayed provider postback rather
 *              than surfacing a 500.
 *   'update' -- like 'ignore', but when the repeat carries NEW information (a later status such as pending -> confirmed /
 *              rejected, or a changed amount / commission for a revshare update) the stored row is updated and
 *              { duplicate: true, updated: true, id } is returned. A weaker status never overwrites a stronger one, so an
 *              out-of-order retry cannot turn a confirmed conversion back into pending.
 */
export async function recordConversion(db, {
  clickId = null, trackingLinkId, offerId, casinoId, partnerId, programId, accountId,
  campaignId = null, conversionType, status = 'pending', reportedValue = null, currency = 'USD',
  countryCode = null, geoCode = null, externalReference = null, createdBy = null,
  onDuplicate = 'throw', source = 'manual', reportedCommission = null, externalPlayerId = null, occurredAt = null
}) {
  const term = await resolveApplicableTerm(db, {
    programId, accountId, casinoId, geoCode: geoCode ?? countryCode
  });
  const calculatedCommission = calculateCommission(term, reportedValue);

  try {
    const result = await db.prepare(`
      INSERT INTO analytics_conversions (
        click_id, tracking_link_id, offer_id, casino_id, partner_id, program_id,
        account_id, commercial_term_id, campaign_id, conversion_type, status,
        reported_value, calculated_commission, currency, country_code,
        external_reference, created_by, source, reported_commission, external_player_id, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `).bind(
      clickId, trackingLinkId, offerId, casinoId, partnerId, programId, accountId,
      term?.id ?? null, campaignId, conversionType, status, reportedValue, calculatedCommission,
      currency, countryCode, externalReference, createdBy, source, reportedCommission, externalPlayerId,
      toSqlTime(occurredAt)
    ).run();
    return { duplicate: false, term, calculatedCommission, ...result };
  } catch (e) {
    // SQLite's UNIQUE-violation message names the columns; string-match
    // is the same defensive style already used elsewhere in this file
    // (see logEvent's catch) since D1 doesn't expose a typed error code.
    // The index is now 3-column (account_id, external_reference, source)
    // as of 0034 -- see that migration for why a postback row and a
    // later import row for the SAME external_reference must NOT be
    // treated as duplicates of each other.
    const isDedupeConflict = /UNIQUE constraint failed.*idx_conversions_external_ref|analytics_conversions\.account_id.*external_reference/i.test(e.message || '');
    if (isDedupeConflict && onDuplicate === 'ignore') {
      return { duplicate: true, term, calculatedCommission };
    }
    if (isDedupeConflict && onDuplicate === 'update') {
      const upd = await updateExistingConversion(db, {
        accountId, externalReference, source, status, reportedValue, reportedCommission, calculatedCommission, termId: term?.id ?? null
      });
      return { duplicate: true, updated: upd.updated, id: upd.id, term, calculatedCommission };
    }
    throw e;
  }
}

/**
 * Resolves a click_id back to everything the tracking redirect knew
 * at click time -- the ONLY attribution lookup the postback pipeline
 * uses (brief §6: exact click_id match only, never a time-window or
 * last-touch guess). Reads from analytics_events, the canonical event
 * stream the redirect writes to (worker/controllers.js
 * recordRedirectClick), not the legacy `clicks` table.
 *
 * Returns null when click_id is null or genuinely not found -- the
 * caller is responsible for storing the conversion as unattributed
 * (click_id = NULL on analytics_conversions) rather than inventing a
 * match.
 */
export async function getClickAttribution(db, clickId) {
  if (!clickId) return null;
  return await db.prepare(`
    SELECT
      e.click_id, e.tracking_link_id, e.offer_id, e.casino_id,
      e.partner_id, e.program_id, e.country_code, e.occurred_at
    FROM analytics_events e
    WHERE e.click_id = ?
      AND e.event_type IN ('TRACKING_LINK_CLICK', 'OFFER_CLICK', 'AFFILIATE_REDIRECT')
    ORDER BY e.occurred_at DESC
    LIMIT 1
  `).bind(clickId).first();
}
