import { resolveApplicableTerm, calculateCommission } from '../affiliate-commercial-terms.js';

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
 */
export async function recordConversion(db, {
  clickId = null, trackingLinkId, offerId, casinoId, partnerId, programId, accountId,
  campaignId = null, conversionType, status = 'pending', reportedValue = null, currency = 'USD',
  countryCode = null, geoCode = null, externalReference = null, createdBy = null,
  onDuplicate = 'throw', source = 'manual', reportedCommission = null, externalPlayerId = null
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
        external_reference, created_by, source, reported_commission, external_player_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      clickId, trackingLinkId, offerId, casinoId, partnerId, programId, accountId,
      term?.id ?? null, campaignId, conversionType, status, reportedValue, calculatedCommission,
      currency, countryCode, externalReference, createdBy, source, reportedCommission, externalPlayerId
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
