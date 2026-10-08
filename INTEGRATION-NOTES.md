# Integration of the newsroom platform onto the updated (content-engine) codebase

## What this is
`lummet-tenant-en-integrated.zip` contains `en/` from `contentmybestversion.zip` (your new
source of truth — includes the team's research engine and generic content engine: sportsbook,
affiliate-partner, custom content types, comparisons, review-criteria rebuild) with the entire
newsroom platform (Stages A–L from this conversation) merged on top.

## How the merge was done, and why it's safe
1. Diffed `contentmybestversion.zip` against the original pristine upload: **44 new files**
   (research + generic content engine), **0 files removed**, and **17 shared files changed —
   every change purely additive** (routes, controllers, api.js, admin nav, admin JS, etc.).
2. Re-applied the newsroom's cumulative patch (12 pre-existing files) with `patch -p2` against
   these updated files. **Every hunk applied — zero rejects**, syntax-checked clean.
3. Copied in all newsroom-only new files (worker modules, templates, CSS, tests).
4. **Renumbered my migrations** from 0045–0050 to **0053–0058**, since the content-engine team
   had already taken 0045–0052 for research/generic-content. Updated the few tests that
   hardcoded migration filenames/ranges to match.
5. Checked for naming collisions: table names, `system_settings` flag keys, route prefixes,
   reserved slugs — **none**. The content engine's own route additions (`/en/sportsbook/...`,
   `/en/custom/...`, `/en/compare/...`, `/en/research/...`) and the newsroom's
   (`/en/news/topic|entity|series/...`, `/en/dashboard/newsroom`) sit side by side in
   `routes.js` with no overlap, verified by direct route resolution.
6. Confirmed `worker/render.js` (the file with the `<title>`/JSON-LD escaping security fixes)
   was **untouched** by the content-engine team, so that patch applies with no semantic risk.

## Verification (this merged codebase, not the old one)
- `npm test`: **557 / 557 passing, 0 failed, 0 skipped** — this is the content-engine team's
  own 35 test files *plus* every newsroom test file, run together.
- The production-snapshot suite (20 tests) ran against the real data export, not skipped:
  every migration applies cleanly, all data is preserved, every live article and the news
  homepage render identically (flags off) or correctly (flags on).
- A final direct smoke test: applied every migration (through 0058) to the production data
  copy, turned on every `news_*` flag, and rendered a real article (200, 69.6 KB) and the v2
  homepage (200, 57.6 KB).
- Route resolution double-checked directly: no collisions between newsroom paths and the new
  sportsbook/affiliate-partner/custom/comparison/research paths.

## What you need to do
- The production database export (`levelcasd1.sql`, contains credential hashes) is **not**
  included in this zip. Apply migrations `0053`–`0058` to your real D1 (in order, after
  confirming `0045`–`0052` are already applied) the same way described in
  `en/docs/newsroom-audit-and-plan.md` and `en/docs/newsroom.md`.
- Everything from Stages A–L is still there and still off by default behind its flag; see
  `en/docs/newsroom.md` section 4 for the full flag list and what each needs before enabling it.
