# Lummet AI — round 2: dedicated SPA parity, cross-subdomain login, more prompts

Follow-up to `CHANGES-lummet-ai-public-access.md` (round 1, already merged and
committed as `feat(lummet-ai): public access with 3-free-message gate...`).
This round addresses the 3 points raised after confirming that merge:

## 1. Cross-subdomain login (`en/worker/auth.js`)

The session cookie was host-only (`Path=/; HttpOnly; Secure; SameSite=Lax`,
no `Domain=`), so it was never sent from the browser to `lummet.<domain>` —
a different subdomain than where login happens. Added `getCookieDomain()`:
derives `.{parentDomain}` from the request hostname (stripping a leading
`www.` if present) and sets it on the cookie in both `login()` and
`logout()` (the only two places that set/clear it — `register()` doesn't
auto-login). Falls back to the old host-only behavior for `localhost`, bare
IPs, or any hostname with no dot, so local/`wrangler dev` testing is
unaffected.

This is what actually makes "login via tenant current login, continue in
lummet AI" possible — everything else below depends on this.

## 2. Dedicated `lummet.` subdomain SPA now has the same gate (`en/worker/lummet/router.js`, `en/lummet/index.html`)

This interface (`en/lummet/index.html` + its own router in
`en/worker/lummet/router.js`) is entirely separate from the sitewide bubble
widget patched in round 1 — different HTML, different backend handlers,
calling `aiAssistant.chat()`/`chatStream()` directly rather than through
`worker/api.js` / `worker/ai/api.js`. Round 1 never touched it, which is
exactly why the free-tier gate and auth continuation didn't apply there.

- `router.js`'s `handleChat`/`handleChatStream` now pass `ipHash` into the
  assistant's userContext (previously computed but never passed — the
  free-tier check silently saw `undefined` and always reported unlimited).
- Both handlers now call `getCurrentUser(request, env)` and pass the real
  `userId` instead of a hardcoded `null` — so a signed-in visitor (now that
  the cookie is shared, per #1) is recognized and unlimited/continues into
  their account.
- `en/lummet/index.html`'s inline script:
  - persists `session_id` in `localStorage` (`lummetSessionId`) instead of
    regenerating it on every page load *and* every "New Chat" click (the
    latter was also silently orphaning the stored id — fixed).
  - handles `requiresAuth`/`auth_required` in both the JSON and SSE-stream
    response paths, rendering "Create free account" / "Log in" buttons.
  - Since this page lives on `lummet.<domain>` but registration/login live
    on the parent domain, the CTA's `redirect` param has to be an absolute
    URL back to the current `lummet.` page. `static/js/main.js`'s
    `getSafeRedirectParam()` now accepts that one specific case (https,
    hostname exactly `lummet.<current-hostname>`) in addition to the
    existing same-site relative-path case — still rejects any other
    external domain, so this isn't an open redirect.
  - shows a small "You're signed in — continuing your conversation" toast
    on return, via a `lummetReopenToast` localStorage flag armed right
    before navigating to register/login.

## 3. Expanded, rotating pre-configured prompts

Previously: 4 static chips in the bubble widget, 8 static cards in the SPA,
identical every time. Both now draw a random subset from a larger pool
each time the welcome/suggestions screen renders (widget: 4 of 12 pool
items on open and on "clear chat"; SPA: 8 of 14 pool items on load and on
"New Chat"; widget's post-answer follow-up chips: 4 of 6 pool items).

Added coverage beyond what existed: site navigation/"what's on this site",
latest news & platform updates, licensing & safety, how withdrawals work,
live dealer/slots, mobile experience — matching the payment-methods/nav/
homepage-sections retrieval added in round 1, which had nothing surfacing
it as a suggested prompt.

## Not done this round (still open)

- **Migration coverage**: only `levelcasino-db` has `ai_free_tier_usage`
  (see round-1 notes). Still needs applying to the other 6 tenant
  databases (`freewin-db`, `lummet-db`, `clustercasino-db`, `neuroodds-db`,
  `legendodds-db`, `brilliantodds-db`) — anonymous chat on the sitewide
  widget still 500s on those until that's done.
- The SPA's "Sign In" overlay (email/password → `/api/admin/login`) is a
  *separate* internal admin/CMS login (bulk SEO, toggle-publish, generate
  review, etc.) — unrelated to the tenant customer login this patch wires
  up. Left untouched; didn't seem to be what was being asked about, but
  flagging so it isn't confused with the new customer auth-gate.
