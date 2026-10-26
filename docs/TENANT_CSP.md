# Customer-site Content Security Policy (Round 6.3C, release 2.6.0.8)

Finding: before this round the tenant Worker sent no CSP and no other security headers on customer sites.

## Setting
`TENANT_CSP_MODE` (tenant Worker variable): `off` (default, nothing changes) or `report-only`. There is no enforce mode in this round. `TENANT_CSP_REPORT_URI` (optional): a same-site path (`/csp-report`) or an `https://` address; anything else is ignored. No collector exists on the tenant side, so without a report address violations appear only in the browser console. [OPEN] where reports go is an owner decision.

## What it does
In `report-only`, every HTML page (not JSON, images, scripts, styles or redirects) gets `Content-Security-Policy-Report-Only`. A page that already sets its own CSP is left alone. Nothing is blocked.

The policy (`en/worker/security-headers.js`) allows the origins the shipped templates and scripts use: Cloudflare Turnstile (`challenges.cloudflare.com` in `script-src`, `frame-src` and `connect-src`), Google Tag Manager and Google Analytics, cdnjs and jsDelivr for the PDF-export libraries, YouTube for hero embeds. It blocks plugin objects and restricts `base-uri` and `form-action` to the site. `'unsafe-inline'` is allowed for scripts and styles because customer pages contain inline scripts; that is why enforcement is not offered yet.

## Turnstile pass-through (confirmed by tests, `en/test/tenant-turnstile.test.js`)
- The widget and its script are rendered only when the site has a site key.
- The browser script requires the token only when a site key is present and sends it with the login and register requests.
- The Worker verifies it against Cloudflare's `siteverify` with the site's secret; with no secret the site is not using Turnstile; with a secret a missing, rejected or unverifiable token is refused.

## Findings left for the owner (not changed in this round)
- `templates/layout/base.html` loads Google Tag Manager with a hard-coded measurement id on every customer site. That is a data-protection and consent question as well as a CSP one.
- Enforcing a CSP later needs nonces for inline scripts or moving them to files.

## Evidence status
TESTED LOCALLY: header logic, origin coverage of the shipped templates, Turnstile verification and wiring. NOT VERIFIED: real browsers, a live customer site, Turnstile in staging.
