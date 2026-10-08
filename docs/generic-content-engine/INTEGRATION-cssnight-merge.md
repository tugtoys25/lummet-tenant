# Integration: Generic Content Engine → cssnight / Research Engine branch

**Date:** 2026-09-20
**What changed:** the 8-phase Generic Content Engine work (built earlier against an
older snapshot of this repo, no `.git` history) was integrated into the current
`main` branch, which had since gained a large, unrelated "Research Intelligence
Engine" feature (entities, sources/claims, relationship graph, versioning, review
queue, datasets — migrations `0045`-`0050`, commits `36c01b1`..`27c044f`) plus several
`lummet-ai` fixes.

## Why this wasn't a simple copy-paste

Both efforts touched the same shared files — `worker/index.js`, `routes.js`,
`controllers.js`, `sitemap.js`, `breadcrumbs.js`, `api.js`,
`templates/layout/admin-nav.html` — and, more seriously, **both used migration
numbers `0045` and `0046`** for their first two files. Dropping the Generic Content
Engine's files in as-is would have either overwritten the Research Engine's
migrations outright or produced two different `0045_*.sql` files with undefined
apply order.

## What was actually done

1. **Diffed every file the Generic Content Engine touched** against the *original*
   pre-Research-Engine snapshot, to isolate exactly what the Generic Content Engine
   changed, independent of anything else.
2. **Diffed the new branch's version of those same files** against that same original
   snapshot, to see what the Research Engine (and other parallel work) had changed
   independently.
3. For the 7 shared code files: applied the Generic Content Engine's changes as a
   patch (`patch --fuzz=3`) against the new branch's *current* versions — not by
   overwriting them. All 7 applied cleanly (with only line-number offsets, zero
   content conflicts), confirming the two efforts never touched the same lines.
4. **Renumbered** the Generic Content Engine's two migrations: `0045` → `0051`,
   `0046` → `0052` (next free numbers after the Research Engine's `0050`), including
   every internal comment that referenced the old filenames/numbers as
   self-references. Verified the *tables* the two efforts created never collide
   (`content_items`/`comparisons`/`custom_content_types` vs. `research_*`), and that
   permission-resource strings don't either (`content_items`/`comparisons`/
   `custom_content_types` vs. `research`/`research_sources`/`research_relations`/
   `research_datasets`).
5. Copied over every file that existed **only** in the Generic Content Engine's work
   (new `worker/database/*.js` modules, `content-resolver.js`, templates, etc.) — no
   merge needed, since nothing else in the repo touches those paths.
6. **Discovered this repo already has a real automated test suite**
   (`en/test/*.test.js`, run via `npm test` / `node --test`, 201 tests before this
   integration) with its own D1-shim and fixtures — independently converging on
   almost the same design as the ad-hoc test harnesses the Generic Content Engine
   work had been using. Ported that work's test coverage into this suite's format
   (`en/test/generic-content-engine*.test.js`) rather than leaving it as
   disconnected scripts.
7. Ran the **full combined suite**: 238/238 passing (201 pre-existing + 37 new), 0
   failures — the strongest available confirmation that neither feature set broke
   the other.

## One real bug this process caught

The first run of the newly-ported test suite failed one test:
`content-resolver.js`'s casino branch returned `null` for a fixture casino. Root
cause: this repo's shared test fixture (`test/support/fixtures.js`) seeds casinos
without `published`/`status` set, because it was built for item-access-scoping
tests, not public-visibility tests — and `getCasino()` (correctly) only returns
`published = 1 AND status = 'published'` rows. Not a real bug in either codebase;
fixed by publishing the fixture casino explicitly inside the new test's own
`beforeEach`, rather than changing the shared fixture (which other tests depend on
staying unpublished-by-default).

## File-level summary

See `git status` at the repo root for the exact list. Net effect:
- **24 files added**, **9 modified**, **0 deleted, 0 renamed, 0 existing-casino files touched.**
- Migrations: `0045`/`0046` → `0051`/`0052` (renumbered, see above). Research
  Engine's `0045`-`0050` are completely unmodified.
- No file from the Research Engine, `lummet-ai`, or any other prior work was
  deleted or overwritten.

## Verifying this yourself

```bash
cd lummet-tenant/en
npm test          # 238/238 should pass
```

---

## Addendum: re-integrated onto a newer upload (same day)

A second upload (`munanightmybestversion.zip`) arrived one commit ahead of the
`cssnight` upload this document describes: `8cb62ed` ("Add Research Zone Super API
(v11) and casino-payment_method assignment"), on top of the same `27c044f` base.

That commit only touches `en/worker/super/capabilities.js`, `super/handlers.js`, and
`super/router.js` — a separate Super API module this project never touches — and
reuses existing `casino_payment_methods`/`setCasinoPaymentMethods` functions rather
than adding new tables or migrations. Verified all 10 files this integration cares
about (`index.js`, `routes.js`, `controllers.js`, `sitemap.js`, `breadcrumbs.js`,
`api.js`, `admin-nav.html`, `dashboard.js`, `responsive.css`, `schema.sql`, and the
migrations directory listing) were byte-identical to the `cssnight` upload, so the
same patches were reapplied unchanged rather than re-derived. Full 238/238 suite
re-verified passing against this newer base. Same file list, same migration numbers
(`0051`/`0052`), same result — just confirmed compatible with one more commit of
parallel work.
