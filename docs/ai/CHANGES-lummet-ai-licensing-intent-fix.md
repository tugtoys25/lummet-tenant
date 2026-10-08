# Lummet AI — round 7 (CRITICAL): licensing intent fetched zero country
# data; wrong-country bug in geo lookups

Reported: "Licencing guide for Portugal" and "tax rate UK" returned
completely unrelated content (a random review, a random casino list)
instead of licensing info. Separately, "Which casinos are available in
Kenya?" answered with Rwanda's casino instead. Traced both to their
actual root cause in the code, not guessed at.

## 1. `intent: "licensing"` was a retrieval dead-end (the main bug)

`understand.js` tells the model `licensing` is a valid intent, distinct
from `geo` -- and the model correctly used it for "Licencing guide for
Portugal". But every retrieval gate that fetches country-specific data
checked only for `intent === 'geo'`:

    const isGeo = plan?.intent === 'geo' || isGeoText(text);

None of the `shouldSearchTable(...)` allow-lists for `casinos`,
`countries`, or `seo_pages` included `'licensing'` either. So the
moment the model classified a question as licensing-related -- exactly
the classification it's supposed to make for this kind of question --
retrieval fetched **zero** country data. No COUNTRY INFO block, no
seo_pages. The model was left to answer from whatever loosely matched
in other tables (a random review, a random casino list), which is
exactly what was observed.

This predates rounds 5/6 -- `licensing` has been a listed intent since
`understand.js` was first written -- but it took building and testing
the geo-fact guard against real `licensing`-classified queries to
surface it, since the guard's own protections are moot if the context
it's supposed to check was never populated.

**Fix**: `isGeo` now also matches `intent === 'licensing'`, and
`'licensing'` was added to the relevant-intents list for the
`casinos` (geo-rules join), `countries`, and `seo_pages` retrieval
blocks. Verified with a direct call to `retrieve()` using
`intent: 'licensing'` against a mocked DB -- COUNTRY INFO for Portugal
is now correctly fetched, where before this fix it returned empty.

## 2. Wrong-country bug: the model's own guess could override an exact text match

    const detectedCountry = plan?.country_code || extractCountryFromMessage(query) || country;

`plan?.country_code` (the model's own extraction) was checked *first*,
ahead of a plain, deterministic substring match on the message text.
If the model's classification call returns a wrong country_code for
any reason, it silently wins over an unambiguous match like "...in
Kenya?" -- explaining the Rwanda-instead-of-Kenya answer.

**Fix**: reversed the priority -- the deterministic text match now
wins when the message contains an unambiguous country name; the
model's guess is only used as a fallback when text extraction finds
nothing (e.g. a city name with no literal country mentioned). Verified
directly: forced `plan.country_code = 'RW'` while asking about Kenya
against a mocked DB -- the geo_rules query now correctly binds `'KE'`,
where before the fix it would have used `'RW'`.

## Verified

- `node --check` clean.
- Full existing regression suite (URL sanitizer, author/country/
  contact/responsible-gambling links, geo-fact guard against the
  Portugal/UK fabrication text) re-run -- all still pass, nothing
  regressed from this change.
- Two new targeted tests against real code paths (not just unit logic):
  `retrieve()` called directly with `intent: 'licensing'` and with a
  deliberately-wrong `plan.country_code`, both against a mocked D1
  `prepare()/bind()/all()/first()` -- confirms the actual SQL query
  parameters are now correct, not just that a variable changed value.

## What this means for rounds 5 and 6

Those rounds' guards (the geo-factual-limit prompt rule, the mechanical
fact-stripping guard) were correctly built and correctly tested against
*intent: 'geo'* scenarios -- but a real conversation asking a licensing
question gets classified `intent: 'licensing'` by the model, which this
bug silently routed around all of it. With this fix, licensing-intent
questions now get the same country data, the same recency reminder, and
the same fact guard as geo-intent questions -- closing the gap rather
than requiring yet another parallel set of checks.

## Still outstanding, unrelated

- D1 migration (`ai_free_tier_usage`) still only on `levelcasino-db`.
- 6 tenants beyond `freewin` still need `multiple.yml` triggered.
- The "✕ Not available" badges appearing on non-geo queries (e.g. "best
  live dealer games") weren't fully diagnosed this round -- possibly a
  side effect of the same detectedCountry issue, possibly separate.
  Worth re-checking after this fix deploys before treating it as a
  distinct bug.
