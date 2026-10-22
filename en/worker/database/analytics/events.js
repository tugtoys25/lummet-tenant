const VALID_EVENT_TYPES = new Set([
  'PAGE_VIEW', 'CASINO_VIEW', 'REVIEW_VIEW', 'OFFER_VIEW', 'OFFER_CLICK',
  'TRACKING_LINK_CLICK', 'AFFILIATE_REDIRECT', 'OUTBOUND_CLICK',
  'CONTENT_VIEW', 'CONTENT_CLICK', 'CTA_CLICK', 'BANNER_VIEW', 'BANNER_CLICK', 'SEARCH',
  'USER_LOGIN', 'USER_REGISTRATION'
]);

// ── Event logging ───────────────────────────────────

/**
 * Records one analytics event. Called from the async redirect/API
 * path (worker/tracking/redirect.js, worker/api.js) — never from a
 * public-page render function (audit §8 performance risk #3). Fire
 * this via ctx.waitUntil() at the call site so it never delays the
 * response the visitor is waiting on.
 *
 * Deliberately does not throw on bad event_type — logs are best-
 * effort telemetry, not a request-blocking concern, mirroring the
 * existing logAudit() convention in database/audit.js.
 */
// Page-cache support (worker/page-cache.js): while a page is being rendered
// for the cache, the view events it fires are recorded so they can be replayed
// on every cache hit. `suppress` records without writing (background refresh).
let ALS = null;

try { ({ AsyncLocalStorage: ALS } = await import("node:async_hooks")); } catch { ALS = null; }

export const eventCapture = ALS ? new ALS() : null;

export async function logEvent(db, event) {
  const cap = eventCapture && eventCapture.getStore();
  if (cap) {
    cap.events.push(event);
    if (cap.suppress) return null;
  }
  if (!VALID_EVENT_TYPES.has(event.eventType)) {
    console.error(`analytics.logEvent: unknown event_type "${event.eventType}", dropped`);
    return null;
  }

  try {
    const columns = [
      "event_type", "casino_id", "review_id", "page_id", "news_id",
      "offer_id", "offer_version_id", "tracking_link_id", "partner_id", "program_id",
      "account_id", "campaign_id", "country_code", "region", "city", "device_type",
      "browser", "os", "referrer", "landing_page", "utm_source", "utm_medium",
      "utm_campaign", "utm_term", "utm_content", "session_id", "visitor_hash",
      "click_id", "user_id", "value", "currency", "metadata", "is_bot", "is_duplicate",
    ];
    const values = [
      event.eventType,
      event.casinoId ?? null, event.reviewId ?? null, event.pageId ?? null, event.newsId ?? null,
      event.offerId ?? null, event.offerVersionId ?? null, event.trackingLinkId ?? null,
      event.partnerId ?? null, event.programId ?? null, event.accountId ?? null, event.campaignId ?? null,
      event.countryCode ?? null, event.region ?? null, event.city ?? null, event.deviceType ?? null,
      event.browser ?? null, event.os ?? null, event.referrer ?? null, event.landingPage ?? null,
      event.utmSource ?? null, event.utmMedium ?? null, event.utmCampaign ?? null,
      event.utmTerm ?? null, event.utmContent ?? null, event.sessionId ?? null, event.visitorHash ?? null,
      event.clickId ?? null, event.userId ?? null, event.value ?? null, event.currency ?? null,
      event.metadata ? JSON.stringify(event.metadata) : null,
      event.isBot ? 1 : 0, event.isDuplicate ? 1 : 0,
    ];
    // content_item_id (migration 0059) is only named in the INSERT when
    // the event actually carries one. Every pre-existing event type
    // (casino/review/news views, clicks, conversions...) therefore runs
    // the exact same statement it always did and does NOT depend on
    // migration 0059 having been applied to this tenant's D1 yet -- so
    // deploying the code before/without the migration can never make
    // existing analytics silently drop (logEvent swallows insert errors).
    if (event.contentItemId != null) {
      columns.push("content_item_id");
      values.push(event.contentItemId);
    }
    return await db.prepare(`
      INSERT INTO analytics_events (${columns.join(", ")})
      VALUES (${columns.map(() => "?").join(", ")})
    `).bind(...values).run();
  } catch (e) {
    console.error('analytics.logEvent failed:', e.message);
    return null;
  }
}
