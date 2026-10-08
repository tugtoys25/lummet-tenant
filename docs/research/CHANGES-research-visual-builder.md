# Research Engine — Visual Content Builder (replaces raw-JSON editing)

Replaces the Phase 1 raw-JSON "Content sections" textarea on the
research item admin form with a fully visual, click-to-build editor —
no JSON, no code, ever, for a non-technical editor. Produces exactly
the same `content_json` shape `renderResearchSections()` in
`controllers.js` already expects, so **no backend change was
needed** — this is purely an admin UI upgrade.

Built by mirroring the exact pattern this codebase already uses for
countries/categories/payment-method hub pages
(`wireSeoSectionBuilder`/`renderSeoSections`/`syncSeoSectionsFromDom`
in `admin.js`) — same card-per-section shape, same
add/remove/reorder controls, same event-delegation wiring — so it
looks and behaves consistently with the rest of the dashboard rather
than introducing a new UI pattern.

## What changed for the editor

- **No JSON textarea anywhere.** Every section is a card: pick a
  type from a dropdown, fill in labeled fields, done.
- **12 section types**, each with its own purpose-built form:
  Heading, Rich Text, Statistic, Timeline, Table, Source Citation,
  Fact Card, FAQ, Internal Links, Research Reference, Dataset Table,
  Image.
- **Rich Text and Fact Card bodies use the same TinyMCE editor**
  every other content type in this CMS already uses
  (`rich-editor.js`) — bold/italic/links/images/tables, not a plain
  textarea.
- **Repeatable sub-lists** (timeline events, FAQ items, internal
  links, table columns/rows) each get their own "+ Add" button and
  per-row remove button — no manually counting commas or brackets.
- **Reorder sections** with ↑/↓ buttons; **remove** with one click.
- **4 one-click templates** insert a pre-built group of sections at
  once: Country Report (heading + rich text + statistic + timeline +
  table), Regulator Profile (heading + rich text + fact card + FAQ),
  Sourced Claim (rich text + source citation), Report Composition
  (heading + rich text + a live research reference + a dataset
  table) — an editor can start from one of these and just fill in
  the blanks rather than building from a blank page.
- **Source Citation** sections pick a source from a real dropdown
  (populated from the Sources library on the same page) instead of
  typing a source id.
- **Research Reference** sections search real research items by
  title (no ids to know), and for "snapshot" mode there's a
  **"Fetch current text & freeze it here"** button that pulls the
  chosen item's current title/excerpt and date-stamps it — the editor
  never hand-writes the frozen copy.
- **Dataset Table** sections pick a dataset by name, then a real
  version dropdown (populated from that dataset's actual saved
  versions) instead of typing a version number.
- Adding a new source in the Sources section further down the same
  page immediately updates the Source Citation dropdown in any
  section already open — no page reload needed.

## Files changed

- `en/templates/pages/admin/research.html` — the old
  `<textarea name="content_json_raw">` and its type-documentation
  help text are gone, replaced with the template quick-start bar, the
  `#researchFormSections` container the builder renders into, and the
  "+ Add Section" control. A few new CSS rules (scoped to this page,
  not touching the shared stylesheet) style the section cards.
  Nothing else on this page was touched — Claims, Relationships,
  Version History, and Sources sections are all unchanged.
- `en/static/js/admin.js` — new visual-builder engine (state, 12
  per-type field renderers, the shared card renderer, DOM sync,
  event-delegation wiring, template insertion, and TinyMCE
  init/destroy lifecycle management for the dynamic Rich Text/Fact
  Card fields), plus small integration edits to 3 existing functions:
  `editResearch()` (now parses `content_json` into the builder's
  state instead of dumping it into a textarea), `cancelResearchEdit()`
  (now also resets the builder), and `initResearchForm()`'s submit
  handler (now reads the builder's state instead of `JSON.parse`-ing
  a textarea). The Sources form's success handler gained 2 lines to
  refresh any open Source Citation dropdowns after a new source is
  added.

## Verification performed

- `node --check` on `admin.js` — clean.
- Full existing test suite: **201/201 passing, 0 failures** —
  unchanged (this is an admin-UI-only change; nothing server-side
  was touched, so the same result was expected and confirmed).
- Traced the `RichEditor` integration against its actual source
  (`rich-editor.js`) rather than assuming: confirmed
  `generateEditorId()` respects a pre-set `data-editor-id` (so my
  fixed per-section ids are the ones actually used, not overwritten),
  confirmed `RichEditor.destroy(id)` + a fresh `innerHTML` replacement
  before every re-render can't leak or double-init TinyMCE instances,
  and confirmed `RichEditor.init(textarea, {height})` is the correct
  call for dynamically-added textareas per that file's own
  documented usage pattern.
- Manually traced every add/remove/reorder/type-change code path
  against the section-object shape `renderResearchSections()` (the
  public-page renderer) expects, to confirm the visual builder always
  produces valid input for it — no schema or migration changes were
  needed because this was true by construction.

## What wasn't changed

- The **Datasets** admin page (`research-datasets.html`) still uses
  JSON textareas for its columns/rows — datasets are inherently
  tabular data entry (a grid of values), which a labeled-field form
  doesn't meaningfully simplify over a clearly-documented JSON array;
  worth revisiting as its own follow-up (a spreadsheet-style grid
  widget) if it turns out to be a real friction point in practice.
- No new API endpoints, no new database columns, no migration — this
  is UI-only, reusing every endpoint the Phase 1–6 backend already
  provides.
