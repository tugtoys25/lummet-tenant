# Lummet AI — round 9: two small polish fixes

Both flagged from the SPA transcript that otherwise confirmed the
licensing/geo bug is fixed. Neither is a hallucination in the sense
rounds 5-7 dealt with -- both are real, smaller issues on their own.

## 1. Internal links mislabeled as external sites (`prompt.js`)

The model would write things like:

    UK Gambling Commission: https://level.casino/en/country/gb

The URL itself is real and correctly grounded (our own country page --
the URL guard has nothing to object to), but the label implies it's
the UKGC's own site. Added a rule to the existing COUNTRY & LICENSING
factual-limit section: when suggesting an external body, either name
it with no link attached, or clearly label our link as our own page --
never combine the two into one misleading citation. This section of
the prompt isn't intent-gated, so the rule applies to every answer,
not just geo/licensing ones.

## 2. "Who wrote this review?" as a follow-up wasn't grounded (`retrieval.js`)

Traced this one carefully rather than guessing. The AUTHORS retrieval
block only matches when the *search terms themselves* hit an author's
name or bio via LIKE -- "who/wrote/this/review" never will, so on a
bare follow-up question with no review re-retrieved this turn,
`results.authors` was empty and the model answered from its own
unverified memory of an earlier turn. The name it gave ("Elie
Bizimana") happened to be real, but nothing checked that.

**Important correction I caught before shipping this**: my first
attempt tried to regex the author name out of `conversationHistory`
using the internal `| Author: X` format `buildContextString` uses --
but `conversationHistory` stores the actual natural-language
conversation (the model's own prior *answer* text), never the internal
context string. That regex would never have matched anything. Fixed to
instead match natural phrasing ("written by Elie Bizimana",
"reviewed by ...") in the model's own prior assistant turns, then
verify that name against the real `authors` table before trusting it.
If the extracted name doesn't exist in the table, nothing is added --
no author context, no fabricated link -- rather than a false match.

Verified with a direct `retrieve()` call: conversation history
containing "...written by Elie Bizimana..." from a prior turn, current
message "Who wrote this review?", intent `authors` -- confirms the
real `authors` table gets queried by the extracted name and returns
the genuine record (verified the exact bound SQL parameter, not just
that a variable changed).

## Verified

- `node --check` clean on both files.
- Full existing regression suite (URL guard, geo-fact guard against
  the real Portugal/UK fabrication text, author URL grounding) re-run
  -- all still pass.
- New integration test for the author follow-up path, checked against
  the actual SQL binding, not just returned data shape.

## Still outstanding, unrelated

- The cron-trigger-quota warning on `lummet`/`neuroodds` (Workers Free
  plan limit) -- infrastructure, not code; doesn't block AI chat.
- D1 migration (`ai_free_tier_usage`) coverage across all 7 databases
  -- last checked, still only confirmed on `levelcasino-db`.
