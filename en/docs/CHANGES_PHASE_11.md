# Phase 11 (tenant): summary of what changed and what is NOT verified

**NOT production ready.** This page only collects the Phase 11 patches. Each one has its own changes file with its own list of
tests that were run; those lists are the record, this page does not add to them.

| Patch | Task | What | Details |
|---|---|---|---|
| 11A | T1 | A named preset that keeps sportsbook, partners or custom types also switches the older `content_types_enabled` setting on (never off, never for Full platform) | `CHANGES_PHASE_11A.md` |
| 11B | T2 | One switch per custom content type (`content.custom.<slug>`), Configuration screen rows, public search filtered by the same rule | `CHANGES_PHASE_11B.md` |
| 11C | T4 | Generic `data-cap` tag for dashboard blocks and options; Overview, Analytics and Reports follow the capabilities; admin API of a switched-off module answers empty or `feature_disabled` | `CHANGES_PHASE_11C.md` |
| 11D | T5 | Per-preset snapshots, manifest completeness tests (`ownership.js`), sitemap index fix (no more advertised files that answer 404) | `CHANGES_PHASE_11D.md` |
| docs | T6 | Content packs: design only, nothing built | `DESIGN_CONTENT_PACKS.md` |
| docs | T7 | This page; `OPERATOR_CONFIGURATION.md` sections 3 and 6 corrected (the canary rollout and control plane screens are built) | this patch |

No migration in any Phase 11 patch. No new preset capability id (11B adds dynamic ids of the form `content.custom.<slug>`, which are
validated against the live custom types, not pinned), so `preset-ids-pinned` needed no change in either repository.

## Not done
- **T3** (missing feature switches: ratings, FAQs, review sections, bookmarks, inquiries, submissions, components, homepage builder, import tools): waiting for an owner decision. Nothing built.
- **T6**: design only; implementation needs the owner's answers in section 10 of the design and a migration approved by the owner.
- Known and left alone (see the patch files for the full lists): admin APIs of switched-off modules are not refused; saved report schedules of a switched-off type still run; editors and the content API are not hidden per custom type; two admin templates are unused; Full platform lists no sportsbook, partner or custom sitemap unless the older setting is on.

## NOT VERIFIED
- The full tenant suite was never run by the author of these patches (the owner runs it; GitHub Actions ran it on each release).
- Release run `42160390731` (11C) failed once on `test (24)` and passed on rerun. The failed run was not inspected; it may be a flaky test.
- Real D1 (tests use an in-memory SQLite shim, including the `json_set` merge of 11A), a browser, keyboard or screen reader use, and live checks of any kind.
- The statements added to `OPERATOR_CONFIGURATION.md` about the control plane were taken from the control plane repository's `docs/RELEASE_CONFIGURABLE_PLATFORM.md`. Nothing was run to confirm them.
- The text of `OPERATOR_CONFIGURATION.md` still says in section 1 and elsewhere that no step was exercised on real systems; that remains true.
