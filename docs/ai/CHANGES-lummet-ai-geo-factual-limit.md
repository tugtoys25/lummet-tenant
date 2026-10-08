# Lummet AI — round 5: geo/licensing factual limit (issue #3, option 1)

Implements option 1 from the content-hallucination discussion: a prompt
rule that explicitly caps what the model may state on country/licensing
questions to what's actually in COUNTRY INFO / COUNTRY & CATEGORY
GUIDES, rather than letting it describe "a general licensing process"
from its own training knowledge.

## What changed

`prompt.js`: new "COUNTRY & LICENSING QUESTIONS — STRICT FACTUAL LIMIT"
section, placed right after GEO AWARENESS. States plainly what the
COUNTRY INFO block actually contains (name/currency/language/legal
status/link — nothing else), forbids naming a regulator or stating
fees/tax rates/requirements unless verbatim present in context, and
tells the model what to say instead when asked for detail it doesn't
have (state the legal_status field, point to the country link or an
official source — don't fill the gap with a plausible answer). Explicitly
scoped to regulatory facts only — casino availability/ratings/bonuses
answers are untouched.

## Also fixed while in there: same bug class as round 4's /en/contact fix

Found `/en/responsible-gambling` — referenced directly in `prompt.js`'s
system instructions, same as `/en/contact` was — with the identical
failure mode: not in the SITE SECTIONS allow-list, so the URL guard
would silently downgrade it to the homepage whenever the model included
it (which the prompt itself tells it to do "when relevant"). Added to
SITE SECTIONS. Checked prompt.js for any other `site.url(...)` calls —
this was the only other one.

## Verified

- `node --check` clean on both files.
- Standalone test: both `/en/contact` and `/en/responsible-gambling`
  now survive `sanitizeAnswerUrls()` unchanged.

## What this doesn't do (per the original discussion)

This is prompt-level guidance, not a mechanical guard — a model that
ignores instructions can still ignore this one, the same ceiling as any
prompt rule. Options #2 (post-generation fact-pattern guard for geo
answers) and #3 (route geo/licensing intent to a larger model) remain
on the table if #1 alone doesn't reduce the problem enough in practice.
Worth testing with the same Portugal-style prompts before deciding
whether to invest in #2/#3.

## Still outstanding, unrelated

- D1 migration (`ai_free_tier_usage`) still only on `levelcasino-db`.
- 6 tenants beyond `freewin` still need `multiple.yml` triggered to
  pick up rounds 1–5.
