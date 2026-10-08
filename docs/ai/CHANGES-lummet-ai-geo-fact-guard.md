# Lummet AI — round 6: recency reminder + mechanical geo-fact guard

Round 5's prompt-only fix was tested in production: it worked on the
widget but the SPA still fabricated the identical SRIJ/fee/tax content
for the same Portugal question, in the same deploy. That's the exact
outcome predicted — a prompt rule alone isn't reliable on a fast model,
especially once conversation history has already primed it (the SPA's
first turn casually named real regulators as examples, which appears to
have carried momentum into the next turn). This round implements both
follow-ups discussed.

## 1. Recency reminder (`prompt.js`)

`buildMessages()` now takes an `intent` parameter. For `geo` or
`licensing` intent, a short reminder is appended as the *last* message
before the user's own question — not just once, mid-way through a long
system prompt. Recency in the prompt matters more than position for
smaller models; this specifically targets the "prior turn's momentum
outweighs an earlier instruction" failure mode observed in testing.

## 2. Mechanical geo-fact guard (`retrieval.js`, wired in `assistant.js`)

The actual reliable fix, same philosophy as the URL guard: `answer` is
checked, not trusted. `guardGeoFacts()`:
- Extracts every currency amount / percentage figure that's genuinely
  present in the retrieved context.
- Extracts every `"Name Name (ACRONYM)"`-style authority citation
  genuinely present in context.
- Splits the model's answer into sentences and strips any sentence
  containing a currency/percentage or authority citation *not* found
  in that allowed set.
- If stripping leaves less than ~20 characters of substance (the
  answer was built almost entirely on fabricated specifics — this was
  the UK tax-rate case exactly), returns a clear "I don't have that
  level of regulatory detail" message instead of a gutted fragment or
  the original fabrication.
- Sentences with no specific number/citation (generic prose) are left
  alone — this only targets ungrounded *specifics*, not tone or length.

Applied for `intent === 'geo' || intent === 'licensing'` only, right
after the existing URL guard, in both `chat()` and `chatStream()`.

**Streaming architecture change**: unlike the URL guard, this one needs
complete sentences to evaluate — it can't run token-by-token. For
geo/licensing intent specifically, `chatStream()` now buffers the full
response server-side (no live per-token delta) instead of streaming,
runs both guards once generation finishes, then emits the corrected
text. Every other intent still streams live exactly as before — this
trade-off (no streaming feel) is scoped to this one narrow query type,
in exchange for not showing regulatory misinformation as it's typed
out in real time.

## Bug found and fixed while testing this

The sentence-splitter fragmented URLs and the site's own domain-like
name ("level.casino" used as plain text) because both contain periods
that a naive `.` `!` `?` sentence-boundary regex misreads as sentence
ends — e.g. "...our level.casino page: https://level.casino/en/country/pt"
was getting torn apart mid-link. Fixed by protecting URLs and bare
domain-like tokens (`word.tld` patterns) before splitting, restoring
them after. Caught by testing against the exact real Portugal
transcript text, not synthetic examples.

## Verified

- `node --check` clean on all 3 files.
- Re-ran the full existing regression suite (URL sanitizer streaming/
  non-streaming, author/country link tests) — all still pass, nothing
  regressed.
- New tests specifically against the two real fabricated transcripts:
  - Portugal (SRIJ + fees + 8% tax) → all three specific-fact sentences
    stripped, generic sentences and the real country-page URL survive
    intact.
  - UK ("15% tax... RGD... payable quarterly") → correctly recognized
    as built almost entirely on fabricated specifics, returns the safe
    fallback message rather than a gutted fragment.
  - Control cases (a real casino rating "4.5/5", a genuinely-grounded
    number+acronym) confirmed to pass through unchanged — the guard
    isn't over-triggering on ordinary content.

## Known limitation (stated plainly, not hidden)

This is a heuristic, not an exact-match guarantee like the URL guard —
there's no canonical form for "a regulatory fact" the way there is for
a URL. A fabricated claim phrased without a number or an "(ACRONYM)"
pattern (e.g. "Portugal requires operators to have a physical office")
would not be caught. This closes the two concrete patterns that
actually showed up in your transcripts; it is not a claim that geo/
licensing answers are now fully hallucination-proof.

## Still outstanding, unrelated

- D1 migration (`ai_free_tier_usage`) still only on `levelcasino-db`.
- 6 tenants beyond `freewin` still need `multiple.yml` triggered.
