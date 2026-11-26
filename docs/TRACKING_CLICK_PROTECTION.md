# Click protection for tracked links

Developer reference. Source: `en/worker/tracking/bot-shield.js`, hook in `en/worker/controllers/redirects.js`. Migration 0037.

## What it does
Settings > General > **Click protection** (administrators) controls how `/en/go/<slug or code>` treats automated visitors. **Default is off**: no signal is read, no database call is made, the redirect behaves as before.

| Mode | Effect |
|---|---|
| `off` (default) | Nothing runs |
| `flag` | Everyone is still redirected. Suspicious clicks are stored as bot clicks (`is_bot = 1`, reasons in `metadata.bot_signals`), so earnings and analytics reports that already exclude bots leave them out |
| `hold` | As `flag`, and clicks with strong evidence of automation get HTTP 403 instead of the redirect (still recorded) |

Always, in every mode: the redirect response carries `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`. When the mode is not `off`, robots.txt also adds `Disallow: /en/go/` and `Disallow: /go/`.

## Signals
A click is suspicious with one **strong** signal or two **weak** ones. Only strong signals can cause a hold.
- Strong: automation user agent (headless browsers, scripting libraries, scrapers), HEAD request, prefetch/preview request (`Sec-Purpose`, `Purpose`, `X-Moz`), Cloudflare bot score <= 10 (only when the plan provides `request.cf.botManagement`), more than the limit of clicks by one visitor in 10 minutes (default 20, range 3 to 1000, across all tracked links).
- Weak: no user agent, no Accept-Language, bot score 11..29, verified crawler.
The existing user-agent bot check (`classifyUserAgent`) is unchanged and still applies.

## What was not changed
Link resolution, geo rules, health fallbacks, click ids, macros, postbacks, the click log and analytics schema. The redirect now builds its 302 with `goRedirect` (same URL validation as `Response.redirect`, plus the two headers). `handleContentTrackedRedirect` (sportsbook / partner / custom links) and the newsroom affiliate links are not covered by this protection.

## Storage and failure behaviour
Table `go_click_velocity(visitor_hash, bucket, hits)`: one row per visitor per minute, pruned in the background (about 2% of clicks delete buckets older than an hour). Visitor = the same IP hash the click log already uses. Settings are cached 30 seconds per isolate. Any error in this module (database, settings, signals) means "not suspicious": the visitor is redirected.

## Admin API
`GET|POST /en/api/v1/settings/click-protection`, administrators only (403 otherwise). POST `{ mode: off|flag|hold, limit }`; validated; saves `go_bot_mode`, `go_bot_rate_limit`; audit action `click_protection_changed`.

## Rollout advice
Start with `flag`, compare flagged clicks with your partner's reports for a week, and move to `hold` only if automation still gets through. Keep the limit above what a real visitor can do (one person rarely makes 20 tracked clicks in 10 minutes; shared networks can).

## Limits
A bot that looks exactly like a browser and clicks slowly is not caught; that needs Cloudflare Bot Management or Turnstile in front. Visitors behind one shared address (offices, mobile carriers) share one rate counter.

## Tests
`en/test/click-protection.test.js`: signals, off/flag/hold on the real redirect, rate limit, fail-open on database errors, robots.txt, admin API.
