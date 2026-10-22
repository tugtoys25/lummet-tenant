// Affiliate and tracked redirects and click recording.
// Part of worker/controllers.js, which re-exports everything from here.
import * as contentItems from "../database/content-items.js";
import { logClick } from "../database/clicks.js";
import { geoEngine } from "../geo.js";
import { resolveRedirectTarget } from "../tracking/redirect.js";
import { logEvent as logAnalyticsEvent } from "../database/analytics.js";
import { render404 } from "./system-pages.js";

async function hashIP(ip){

  if(!ip){
    return "";
  }

  const data =
    new TextEncoder()
      .encode(ip);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array
    .from(
      new Uint8Array(hash)
    )
    .map(b =>
      b.toString(16)
       .padStart(2,"0")
    )
    .join("");
}

/**
 * Deliberately minimal, honest device classification -- 'mobile' /
 * 'tablet' / 'bot' / 'desktop' via a few unambiguous substring
 * checks, nothing more. This is NOT a full user-agent parser: we do
 * not attempt to name a specific browser or OS from the UA string,
 * because a crude regex guess there is wrong often enough that it
 * would violate the "never fabricate data" rule -- an admin looking
 * at a "Safari" column should be able to trust it's actually Safari.
 * If real browser/OS analytics are wanted later, that's a deliberate
 * follow-up decision to bring in a proper UA-parsing library, not a
 * guess bolted on here.
 */
function classifyUserAgent(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return { deviceType: 'unknown', isBot: false };
  if (/bot|crawler|spider|slurp|bingpreview|facebookexternalhit/.test(ua)) {
    return { deviceType: 'bot', isBot: true };
  }
  if (/ipad|tablet/.test(ua)) return { deviceType: 'tablet', isBot: false };
  if (/mobi|iphone|android/.test(ua)) return { deviceType: 'mobile', isBot: false };
  return { deviceType: 'desktop', isBot: false };
}

/**
 * Fires both the existing click log (unchanged, still the System-3
 * source of truth for tracking-link health/redirect debugging) and
 * the new canonical analytics event, via ctx.waitUntil so NEITHER
 * delays the redirect response the visitor is waiting on. Falls back
 * to awaiting inline only if no ctx was supplied (e.g. a future
 * direct unit-test call to handleAffiliateRedirect) so logging still
 * happens rather than being silently skipped.
 */
function recordRedirectClick(env, ctx, { eventType, casinoSlug, casinoId, countryCode, city, ipHash, userAgent, trackingLinkId, offerId, partnerId, programId, clickId }) {
  const { deviceType, isBot } = classifyUserAgent(userAgent);

  const work = Promise.all([
    logClick(env.DB, casinoSlug, countryCode, city, ipHash, userAgent, { trackingLinkId, offerId }),
    logAnalyticsEvent(env.DB, {
      eventType,
      casinoId: casinoId ?? null,
      trackingLinkId: trackingLinkId ?? null,
      offerId: offerId ?? null,
      // Carried straight off the tracking link so a later conversion
      // postback (worker/database/analytics.js getClickAttribution)
      // can resolve partner/program without a second join back
      // through tracking_links -- see worker/postback/ingest.js.
      partnerId: partnerId ?? null,
      programId: programId ?? null,
      countryCode, city, deviceType, isBot,
      visitorHash: ipHash,
      clickId
    })
  ]);

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(work.catch(() => {
      // Best-effort logging -- never surface a logging failure to the visitor.
    }));
  } else {
    return work.catch(() => {});
  }
}

export async function
handleAffiliateRedirect(
  request,
  env,
  identifier,
  ctx = null
){

  const edgeGeo = {
    country: request.cf?.country || null,
    city: request.cf?.city || "Unknown"
  };
  const geoInfo = geoEngine.process(request, edgeGeo);

  const result = await resolveRedirectTarget(env.DB, {
    identifier,
    countryCode: geoInfo.country
  });

  if (result.type === "not_found") {
    return render404(request, env);
  }

  const ipHash =
  await hashIP(
    request.headers.get(
      "CF-Connecting-IP"
    )
  );
  const userAgent = request.headers.get("user-agent");
  // Generated once per redirect so a later conversion postback
  // (analytics_conversions.click_id) can attribute back to this
  // exact click without guessing -- see worker/database/analytics.js.
  const clickId = crypto.randomUUID();

  // A known link that isn't redirectable right now (health-broken or
  // GEO-ineligible for this visitor's country). Falls back to the
  // casino's own legacy URL when available -- a RELATED fallback, not
  // the "unrelated fallback casino" the brief explicitly warns
  // against. With no fallback at all, show the same not-found
  // experience rather than a raw error -- the visitor doesn't need to
  // know the technical distinction between "doesn't exist" and
  // "temporarily broken."
  if (result.type === "unavailable") {
    if (result.fallbackUrl) {
      recordRedirectClick(env, ctx, {
        eventType: "AFFILIATE_REDIRECT",
        casinoSlug: result.casino?.slug || identifier,
        casinoId: result.casino?.id ?? null,
        countryCode: geoInfo.country, city: geoInfo.city, ipHash, userAgent,
        trackingLinkId: result.trackingLink.id, offerId: result.trackingLink.offer_id,
        partnerId: result.trackingLink.partner_id, programId: result.trackingLink.program_id,
        clickId
      });
      return Response.redirect(result.fallbackUrl, 302);
    }
    return render404(request, env);
  }

  if (result.type === "tracking_link") {
    recordRedirectClick(env, ctx, {
      eventType: "TRACKING_LINK_CLICK",
      casinoSlug: result.casino?.slug || identifier,
      casinoId: result.casino?.id ?? null,
      countryCode: geoInfo.country, city: geoInfo.city, ipHash, userAgent,
      trackingLinkId: result.trackingLink.id, offerId: result.trackingLink.offer_id,
      clickId
    });
    return Response.redirect(result.destinationUrl, 302);
  }

  // result.type === "legacy_casino" -- identical behavior to before
  // this system existed, for any link not yet migrated to a tracking link.
  recordRedirectClick(env, ctx, {
    eventType: "AFFILIATE_REDIRECT",
    casinoSlug: result.casino.slug,
    casinoId: result.casino.id,
    countryCode: geoInfo.country, city: geoInfo.city, ipHash, userAgent,
    trackingLinkId: null, offerId: null,
    clickId
  });
  return Response.redirect(
    result.destinationUrl,
    302
  );
}

// =====================================================
// SPORTSBOOK (Phase 3 — generic content engine)
// Storage: content_items (content_type = 'sportsbook'), migration
// 0051/0052. Mirrors renderCasino/renderCasinoList's structure and
// conventions, reusing category.html for the listing (same pattern
// renderCasinoList itself already uses) and the new, generic
// content-item.html for the detail page. SEO and components are
// fully generic already (loadDynamicSeo/renderAllComponents are
// keyed by pageType/pageSlug against seo_meta and the component
// engine, both already type-agnostic — see the Phase 0/1 audit).
//
// Enablement (content_types_enabled) is checked by the caller in
// index.js before this function is reached, per the Phase 2 report
// §8 design — this function assumes it has already been called only
// because sportsbook is enabled for this environment.
//
/**
 * Tracked outbound link for sportsbook/affiliate_partner/custom items
 * (content_items.tracking_url, migration 0060). Deliberately NOT the
 * casino pipeline above (tracking_links/click_id/postback/commercial
 * attribution) -- this only logs a CONTENT_CLICK analytics event
 * (content_item_id, migration 0059) and redirects. Falls back to
 * item.website if tracking_url isn't set, so the "Visit Site" CTA
 * always has somewhere to go once ANY URL is configured.
 */
export async function handleContentTrackedRedirect(request, env, contentType, slug, ctx = null) {
  if (!["sportsbook", "affiliate_partner", "custom"].includes(contentType)) return render404(request, env);
  const item = await contentItems.getPublishedContentItem(env.DB, contentType, slug);
  if (!item) return render404(request, env);
  const target = item.tracking_url || item.website;
  if (!target) return render404(request, env);

  const edgeGeo = { country: request.cf?.country || null, city: request.cf?.city || "Unknown" };
  const geoInfo = geoEngine.process(request, edgeGeo);
  const ipHash = await hashIP(request.headers.get("CF-Connecting-IP"));
  const userAgent = request.headers.get("user-agent");
  const { deviceType, isBot } = classifyUserAgent(userAgent);

  const work = logAnalyticsEvent(env.DB, {
    eventType: "CONTENT_CLICK",
    contentItemId: item.id,
    countryCode: geoInfo.country, city: geoInfo.city, deviceType, isBot,
    visitorHash: ipHash,
    referrer: request.headers.get("referer") || null,
    metadata: { content_type: contentType },
  }).catch(() => {});
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(work);
  else await work;

  return Response.redirect(target, 302);
}
