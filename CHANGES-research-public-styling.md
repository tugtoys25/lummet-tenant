# Research Engine — Public Page Styling (fixes "tables rendered not well")

Fixes a real gap that's existed since Phase 1: the Research Engine's
public pages have never had any CSS. `renderResearchSections()` and
friends in `controllers.js` emit HTML with `.research-*` class names,
but no stylesheet anywhere in the codebase ever defined them —
confirmed by grepping every `.css` file before writing this fix. Every
research page has been rendering as bare, unstyled HTML the whole
time; this only became visible once real content (your Netherlands
research pack) existed to look at.

Also fixes a second, real issue your new dataset content surfaced:
`columns_json` has always supported an optional per-column `type`
hint (`text`/`number`/`boolean`/`date` — see the comment in migration
`0050`), but no renderer ever actually used it. A `boolean` column's
`true`/`false` values were printing as the literal words "true"/
"false" instead of being formatted.

## What changed

- **New file: `en/static/css/research.css`** — covers every class
  name the research renderer actually emits: hub/list cards, the item
  page shell, every content-block type (statistic, timeline, table,
  fact card, source citation, FAQ — FAQ already had styling
  site-wide, confirmed reused rather than duplicated), the Key Facts
  claims list, the Related section, and the Sources footnote list.
  Built entirely from the site's existing design tokens
  (`--primary`, `--dark`, `--gray`, `--light-gray`, `--bg`,
  `--success`, `--danger`, `--radius`, `--shadow`, `--space-*`) so it
  automatically matches whatever theme a tenant has configured,
  rather than hardcoding colors — the same convention every other
  stylesheet in this codebase already follows.
- **`en/templates/layout/base.html`** — one new `<link>` line loading
  `research.css` alongside the other global stylesheets. Every page
  (public and admin) already goes through this file, so no other
  template needed touching.
- **`en/worker/controllers.js`** — two renderer changes:
  - `dataset_table` cells now check each column's `type`: `boolean`
    values render as a checkmark/cross badge (green/red) instead of
    the literal word "true"/"false"; empty/null cells in both
    `table` and `dataset_table` blocks now render as a muted em dash
    instead of a blank gap, which reads as "no data" rather than
    looking like a layout bug.
  - The plain `table` block type now iterates by column count
    instead of by however many cells a row happens to have, so a row
    with fewer cells than columns (as your enforcement-actions
    dataset has, with several `null` `date`/`amount_eur` values)
    can't silently misalign columns.

## What this does NOT change

- No new tables, no migration — this is styling plus a rendering
  formatter, not a schema change.
- The known caveat you flagged yourself — `dataset_table` ignoring a
  dataset's own `published` flag — is unchanged. That's a real,
  separate design question (should an unpublished/draft dataset still
  render wherever it's embedded?) worth deciding deliberately rather
  than bundling into a styling fix. Flagging it back to you: say the
  word and I'll make `resolveDatasetData()` respect `published` for
  `version: "latest"` (a pinned historical version would still always
  render, since that's an intentional frozen citation, not "the
  current state of a draft").

## Verification performed

- `node --check` on `controllers.js` — clean.
- Full existing test suite: **201/201 passing, 0 failures** —
  unchanged (CSS and rendering-format changes only, nothing in the
  data layer touched).
- **Extracted every `.research-*` class name actually emitted** by
  `controllers.js` and both public templates via grep, then
  cross-checked each one against `research.css` — confirmed zero
  gaps, including the dynamic claim-status classes
  (`research-claim--verified/disputed/superseded/unverified`) and the
  new type-aware table-cell classes
  (`research-table__cell--number/boolean`,
  `research-table__bool--yes/no`). The handful of BEM modifier
  classes that showed up as "unstyled"
  (`research-section--statistic`, `research-section--timeline`, etc.)
  are intentional hooks for future per-type overrides — their actual
  visual styling already lives on the inner component classes
  (`.research-stat`, `.research-timeline`, ...), which are fully
  covered.

## Deploying

No migration. Same integration flow as every prior update:

```bash
cd ~/lummet
tar czf ~/lummet-tenant-backup-$(date +%Y%m%d-%H%M%S).tar.gz lummet-tenant
mkdir -p ~/lummet-integration-tmp && cd ~/lummet-integration-tmp
unzip -o ~/storage/downloads/research-styling-fix.zip
rsync -avc --dry-run ~/lummet-integration-tmp/lummet-tenant/en/ ~/lummet/lummet-tenant/en/
rsync -avc ~/lummet-integration-tmp/lummet-tenant/en/ ~/lummet/lummet-tenant/en/
cd ~/lummet/lummet-tenant/en && node --check worker/controllers.js && npm test
```

After deploy, open `/en/research/country/netherlands` (or whichever
of your five NL items) and confirm: the tables have visible borders,
header shading and zebra striping, the stat blocks have the colored
left-border card treatment, the timeline has a connected line with
dots, and the boolean columns in your gambling-tax dataset show a
green check / red cross instead of the words "true"/"false".
