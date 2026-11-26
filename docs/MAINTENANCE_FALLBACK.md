# Maintenance page: why it appears, and how to find out

`en/worker/index.js` catches any uncaught error from the app and serves the static "We'll be right back" page (HTTP 503) instead of a raw 500. That page hides the cause, so it now records it.

- **Response header `x-fallback-reason`:** `storage_quota` (D1/KV/R2 limit or rate limit hit), `storage_unavailable` (network, timeout, outage) or `code_error` (a bug). `curl -sI https://site/en/` shows it.
- **`Retry-After: 30`** for the two temporary reasons (it was 7200 seconds before); a code error keeps the old value.
- **One structured log line per fallback** in Cloudflare > Workers > your Worker > Logs (or `wrangler tail`): `Maintenance fallback triggered: {"reason":...,"path":...,"message":...,"stack":...}`.
- The Safety tab error log (`news_monitoring`) still records the event when that switch is on.
- Code: `en/worker/app/fallback.js` (`classifyFailure`, `fallbackResponse`). The page itself is unchanged and still makes no D1/KV/R2 calls.

`worker/index.js` no longer relies on `this` inside the exported `fetch`, and the address-layout rewrite (`url-layout.js`) now returns the original response if rewriting ever throws, so neither can turn a good page into the maintenance page.

Not verified live: a real quota error on a real site (the labels are matched by message pattern; the first real occurrence will show whether the pattern fits).
