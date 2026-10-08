# Lummet AI — round 3: URL hallucination fix + fuller page coverage

Triggered by a real production example: the assistant answered with
`https://level.casino/en/casino-licensing/portugal`,
`https://level.casino/en/mobile-casinos`, and
`https://level.casino/en/casino-payment-methods` — none of which exist.
Traced it to two real, separate bugs plus one systemic gap, all fixed here.

## 1. Two real "wrong URL" bugs found while investigating

- **Author profile links were wrong for every author, always**:
  `retrieval.js` built `/en/authors/:slug` (plural) — the real route is
  `/en/author/:slug` (singular, confirmed in `worker/routes.js`). Fixed.
- **Country pages never had a link at all**: the COUNTRY INFO context
  block listed currency/language/legal status but no URL, so the model
  had nothing real to cite for "tell me about Rwanda" style questions —
  a direct contributor to inventing one. Fixed: added
  `/en/country/:code` (confirmed the route uses the country's 2-letter
  `code`, lowercased — not a name-slug, despite what the route comment
  suggested).

## 2. The actual hallucination mechanism, and the fix

`prompt.js` already said "never invent URLs, fall back to homepage" —
but with a smaller/fast model (`@cf/meta/llama-3.1-8b-instruct-fast`)
that instruction alone isn't reliable. Two changes:

- **Prompt hardening**: the URL rule now explicitly forbids constructing
  or pattern-matching any URL "that looks like it should exist," and
  points the model at a new always-present SITE SECTIONS list (casino
  list, review list, country list, category list, payment-methods list,
  author list, homepage) as the required fallback instead of the
  homepage alone — giving it somewhere real to point "guide"-style
  questions instead of inventing a page.
- **Code-level guard (the actual reliable fix — `retrieval.js` +
  `assistant.js`)**: every generated answer is now checked against the
  exact set of URLs that were actually placed in its context.
  `sanitizeAnswerUrls()` handles the non-streaming path; any URL not
  found verbatim is replaced with the homepage link. For the streaming
  path, `createStreamingUrlSanitizer()` buffers only the not-yet-decided
  tail of a URL as it streams in token-by-token (holding back a partial
  "h", "ht", "http" etc. and the growing URL body), flushing everything
  else immediately — so normal prose streams with no added latency, and
  a bad URL gets caught and replaced before the client ever sees it.
  This doesn't depend on the model behaving; it's mechanical and applies
  regardless of which model sits behind `env.AI`.
  Tested directly against the reported transcript (see test output):
  all three hallucinated URLs replaced with the homepage; the one real
  URL in the same message (`/en/payment-methods/skrill`) preserved
  untouched.

## 3. Expanded retrieval per your request — category/country hubs, authors, list pages

- **`seo_pages` table** (previously never queried): now surfaces
  - `country_custom` guide pages (`/en/country/:code/:slug`)
  - `category_country` hub pages (`/en/category/:slug/:code`)
  gated on `isGeo` + a detected country, and (for category hub pages)
  matched against categories already found relevant to the query.
- **Always-on SITE SECTIONS block**: real link to every list/hub page —
  `/en/casino`, `/en/review`, `/en/news`, `/en/updates`, `/en/author`,
  `/en/country`, `/en/category`, `/en/payment-methods`, and the
  homepage — present in every answer's context regardless of what else
  matched, both to directly answer "show me the casino list" style
  questions and as real fallback material per the hardened prompt rule.
- `understand.js`'s schema description and table whitelist updated so
  the model's own search-plan can request `seo_pages` directly.

## Verified

- `node --check` clean on all 4 touched files.
- Standalone sanitizer tests: non-streaming, char-by-char streaming
  (worst case), word-chunk streaming, URLs with/without trailing
  whitespace at stream end, and a false-positive check (words starting
  with "h" don't get stuck) — all pass.
- Reproduced the exact reported transcript against the merged code:
  all 3 hallucinated URLs → homepage; the real URL preserved.
- Applied cleanly via `git apply` onto the current repo state (rounds
  1+2 plus your unrelated platform-updates/media-library fixes) — no
  conflicts, confirmed none of those intervening commits touch the 4
  files this round changes.

## Not done / still open (unchanged from before)

- D1 migration for `ai_free_tier_usage` still needs applying to the 6
  tenant databases beyond `levelcasino-db`.
