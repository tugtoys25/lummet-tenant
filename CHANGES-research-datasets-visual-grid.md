# Research Datasets — Visual Spreadsheet Grid (replaces raw JSON)

Replaces the last two JSON textareas in the Research Engine admin —
`columns_json` and `rows_json` on the Datasets page — with a real
spreadsheet-style grid: click a cell, type, or paste a whole table
copied from Excel or Google Sheets. This closes out the "no JSON
anywhere in the research dashboard" requirement — every research
admin surface (items, sources, claims, relationships, datasets) is
now fully visual.

## What changed for the editor

- **A real editable table**, not a textarea. Column headers are
  editable text inputs; each cell is an editable text input.
- **+ Add column / + Add row** buttons; a ✕ on every column header
  and every row to remove it.
- **Paste a whole table straight in.** Copy a table from Excel,
  Google Sheets, or anywhere else that copies as tab-separated text,
  click any cell (or a header cell, to paste headers + data together),
  and paste — the grid grows to fit automatically, adding columns or
  rows as needed.
- New datasets start with a small blank starter grid (3 columns × 2
  rows) instead of an empty box, so there's always something visible
  to build from.
- Blank rows are silently dropped on save — an editor doesn't have to
  manually clean up an unused starter row.

## Why this was safe to build

The grid editor works **purely positionally** — columns are just an
ordered list of labels, rows are just ordered arrays of values,
exactly like a real spreadsheet. The "key" concept the database
actually stores (`research_datasets.columns_json` is
`[{key, label}]`, `rows_json` is an array of objects keyed by that
`key`) never has to be shown to the editor at all: keys are derived
fresh from the current column labels only at the moment of saving
(lowercased, non-alphanumeric replaced with `_`, deduplicated if two
columns end up with the same label). This means:

- Renaming a column is just editing text — nothing breaks.
- Reordering columns needs no data migration — there's no "key"
  bound to a position to keep in sync.
- No backend change was needed. `research-datasets.js`,
  `research-review-queue.js` (which reads dataset row counts), and
  the `dataset_table` content-block renderer all consume the exact
  same `columns_json`/`rows_json` shape as before — only how the
  admin *produces* that shape changed.

## Files changed

- `en/templates/pages/admin/research-datasets.html` — the two
  `<textarea name="columns_json">` / `<textarea name="rows_json">`
  fields are gone, replaced with the grid toolbar
  (`#datasetAddColumnBtn`, `#datasetAddRowBtn`) and the grid table
  itself (`#datasetGridTable`), plus scoped CSS for the grid (spreadsheet
  borders, sticky-feeling header row styling, hover-to-reveal remove
  buttons). Nothing else on the page changed — title/slug/description/
  status/published fields and the version-history panel are untouched.
- `en/static/js/admin.js` — a new, self-contained grid engine
  (`datasetGridState`, `slugifyDatasetColumnKey`, `datasetGridLoadFrom`,
  `buildDatasetPayloadFromGrid`, `renderDatasetGrid`, `wireDatasetGrid`,
  `parseTsvClipboard`, and the paste-handling logic), plus small
  integration edits to 3 existing functions: `editDataset()` (now
  loads into the grid instead of two JSON textareas),
  `cancelDatasetEdit()` (now reseeds a blank grid), and
  `initDatasetForm()`'s submit handler (now reads the grid via
  `buildDatasetPayloadFromGrid()` instead of `JSON.parse`-ing two
  textareas, and rejects the save with a plain-English message if
  there are zero columns rather than sending an empty payload).

## Verification performed

- `node --check` — clean.
- Full existing test suite: **201/201 passing, 0 failures** —
  unchanged (admin-UI-only change, no backend touched).
- **Extracted and ran the actual pure-logic functions directly** (not
  just syntax-checked) to verify correctness, not just that it parses:
  - `slugifyDatasetColumnKey`: `"Tax Rate"` → `tax_rate`; a second
    column also labeled `"Tax Rate"` correctly gets `tax_rate_2`
    instead of colliding; an empty label falls back to `column`
    rather than producing an unusable empty key
  - `parseTsvClipboard`: a 3-row tab-separated paste parses into the
    correct 3×2 array, with a trailing blank line (which real
    clipboard copies from spreadsheets always include) correctly
    dropped rather than becoming a phantom empty row
  - **Full round-trip**: loaded a realistic `columns_json`/`rows_json`
    pair (the same Netherlands/Belgium tax-rate example from the
    seed data) into the grid, then rebuilt the save payload from that
    grid state — confirmed the output is byte-for-byte equivalent to
    the input, proving edit → save → reload → edit again never
    silently drifts or loses data
  - Confirmed a genuinely blank row (added but never filled in) is
    correctly excluded from the saved payload while real rows are
    correctly kept

## One real bug caught before delivery

While inserting the new grid-engine block, a large text replacement
initially dropped the `async function loadDatasetsTable() {`
signature line immediately after it (the same failure mode flagged in
the visual-builder delivery two rounds ago — a large insertion whose
tail duplicates text already in the file can silently lose that
duplicated line). Caught immediately by `node --check` failing with
"Illegal return statement" — traced to the exact line, confirmed via
a full read of the surrounding code, and fixed before running the
verification pass above. Every function this update touches was then
individually confirmed to be defined exactly once in the file.
