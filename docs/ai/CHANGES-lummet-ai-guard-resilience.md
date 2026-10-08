# Lummet AI — round 4: guard resilience + fallback contact-link fix

Two bugs found by actually testing round 3 in production (per the
transcripts you shared), fixed here.

## 1. The URL guard itself could fail the whole request

`chat()` called `extractContextUrls(buildContextString(...))` with no
try/catch. If that threw for any reason (unexpected null/shape in a
retrieved row), the entire response failed with "Sorry, something went
wrong" — visible in your transcript on "Licensing guide of Portugal"
and "Tell me more about the first one", both of which needed a retry.

Fixed in both `chat()` and `chatStream()`: the guard is now wrapped so
a failure inside it logs and falls back to the unsanitized answer
(non-streaming) or skips the guard for that response (streaming, via a
`urlSanitizer = null` passthrough) rather than failing the request.
Worst case now is a URL that isn't double-checked — never a dropped
response. Also wrapped `urlSanitizer.push()`/`.flush()` individually so
a runtime error mid-stream degrades to "pass the token through
unchanged" instead of losing output.

## 2. The fallback message's own contact link was getting neutered

`generateFallback()`'s built-in text ("...or contact us at
{site}/en/contact...") is routed through the same URL guard as every
other answer. `/en/contact` was never in the always-on SITE SECTIONS
list from round 3, so the guard correctly-but-wrongly treated it as
"not in context" and replaced it with the homepage — visible in your
transcript as the fallback message showing the homepage link twice.
Added `/en/contact` to the SITE SECTIONS list.

## Verified

- `node --check` clean on both files.
- Standalone test confirms `/en/contact` now survives sanitization
  unchanged in the exact fallback string used in production.

## Not addressed here (separate, harder problem)

Content hallucination (fabricated regulator names/fees for Portugal
licensing, inconsistent between the widget and the SPA) is a different
issue from URL hallucination — the URL guard has no visibility into
factual claims. Needs its own fix (stricter prompt constraints on
country-page answers, and/or a different model) — discussed separately,
not implemented in this round.

## Still outstanding (unrelated, unchanged)

- D1 migration for `ai_free_tier_usage` still only applied to
  `levelcasino-db`.
- The other 6 tenant workers still need `multiple.yml` triggered to
  pick up rounds 1–4.
