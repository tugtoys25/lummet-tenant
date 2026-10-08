# Lummet AI — round 10: typo/spacing/language-tolerant casino matching

Reported: "Casabet" exists in the database, but "casa bet" (typed with
a space) found nothing. Traced the exact mechanism rather than
guessing: LIKE needs the literal bound substring to be present --
`LIKE '%casa bet%'` against a stored value of `casabet` (no space)
can never match, because the space itself isn't there to find.

Three layers, in the order they're tried, each catching what the one
before it can't:

## 1. LLM-level correction (`understand.js`) -- the primary fix

The model was already told to "understand slang, typos, bad English,
and abbreviations" when *interpreting* a message, but nothing told it
to output a *corrected* spelling for `search_terms`/`casino_names` --
it could understand what you meant and still echo back your literal
typo. Added explicit instruction: act as a proofreader first, extract
your best-guess canonical spelling (fixing typos, missing/extra
spaces, incomplete words, or translating from another language), not
the raw text typed. Also notes that casino names are far more likely
stored as one compact word than as separate words -- nudges toward the
tightened-up form when unsure. This is the layer that actually
addresses "language barrier" and "incomplete" wording, not just
spacing/typos -- the other two layers below are safety nets under it,
not equivalent replacements.

## 2. Normalized SQL matching (`retrieval.js`) -- safety net #1

Independent of whether the model corrects the spelling, both the
`casinos` and `reviews` keyword searches now also compare a
punctuation-stripped form of the stored name/slug against a
punctuation-stripped form of each search term
(`REPLACE(REPLACE(REPLACE(REPLACE(LOWER(name),' ',''),'-',''),"'",''),'.','')`).
This alone fixes "casa bet" vs "casabet", "BC Game" vs "BC.Game", and
similar spacing/punctuation variants, with no extra round trip --
still one SQL query.

## 3. Fuzzy (edit-distance) fallback -- safety net #2

For an actual misspelling that survives normalization (an extra,
missing, or swapped letter -- "Cassabett" for "CasaBet"), added
`fuzzyFindCasinoSlug()`: fetches a bounded list (500 max) of published
casino slugs/names, computes Levenshtein distance between each
candidate and the (normalized) name the model extracted, and accepts
a match within roughly 30% of the shorter string's length. Only
triggers when the primary search found nothing *and* the model
specifically identified a casino name (`casino_names` non-empty) -- a
generic query with no name in it never causes a broad fuzzy scan.

## Verified, including a mistake I caught before it shipped

- `node --check` clean on both files.
- Reproduced the exact reported case: "Reviews for casa bet" against a
  mocked DB with a `casabet`/`CasaBet` row -- resolves correctly via
  the normalized SQL layer.
- A genuine typo ("Cassabett") resolves via the fuzzy fallback.
- Checked for false positives: similarly-named real casinos (Evospin/
  Neospin) and their typo'd forms (Evospinn/Neospn) each resolve to
  the *correct* one, no cross-matching.
- An unrelated generic query with no casino name never triggers the
  fuzzy scan (confirmed empty result, not a wrong guess).
- **Caught a misleading test result before trusting it**: "1 win" first
  appeared to fail even the normalized layer, but that was an artifact
  of a test harness I'd built that force-emptied the primary search to
  isolate the fuzzy fallback in isolation. Re-tested against a
  realistic simulation of the actual SQL layer -- "1 win" resolves
  correctly via normalization alone, exactly as it should; the fuzzy
  layer was never actually broken, my isolation test just wasn't
  representative of the real code path.

## Known limitation, stated plainly

Edit distance treats "1win" vs "1wincasino" as very different strings
purely on length, even though one is a clean prefix of the other --
this specific case is actually caught earlier by the normalized SQL
layer (substring containment), not by the fuzzy layer, so it's fine in
practice. But a case that depends on the fuzzy layer *and* involves a
numeral/spelled-number swap ("1win" vs "onewin" with no shared
characters at all) would not be caught by either layer -- edit
distance and substring containment both need real character overlap.
Not fixed here; flagging rather than claiming full coverage.

## Still outstanding, unrelated

- The cron-trigger-quota warning on `lummet`/`neuroodds` (Workers Free
  plan limit) -- infrastructure, not code.
- D1 migration (`ai_free_tier_usage`) coverage across all 7 databases.
