# Research Engine — Branded PDF Export + Hub Classification & Search

Two additive features, both built to work with your real Netherlands
and Germany research packs (checked both uploads for real relation
data before building the "merge related research" feature against it).

No backend architecture change: no new tables, no new migration, and
**no new public API endpoint** — both features work entirely off data
already computed by the existing page renders.

---

## 1. Branded PDF download, on every research item page

**Why client-side, not server-generated:** this Worker has no build
step (`package.json` says so explicitly — "no build step, deployed as
plain JS via wrangler"), so a Node PDF library like `pdf-lib` can't be
bundled into it without introducing a bundler your deploy pipeline
doesn't have. Generating the PDF in the browser via jsPDF (loaded from
cdnjs, same convention already used for other CDN scripts in this
codebase) needed zero changes to the Worker's runtime or build
process.

**What it does:**
- **Download PDF** — builds a multi-page PDF from the page's own
  content: title/subtitle/type/country/last-verified, every content
  section (rich text, statistics, timelines, tables via a real PDF
  table — not an image — fact cards, FAQs, source citations), the Key
  Facts (claims) list with verified/unverified status, and the
  numbered Sources list.
- **Branded header/footer on every page** — your site's logo (if it's
  a PNG/JPEG/WEBP; see caveat below) and name at the top, and a
  footer with the generation date, the canonical URL, and an explicit
  "content may have changed since" disclaimer, plus page numbers.
- **Merge related research** — if the item has related research items
  (the same `research_relations` data your Netherlands/Germany packs
  already populate — e.g. the 7 `part_of` relations in the Germany
  pack), a checklist appears letting the reader include any of them;
  checked items are fetched (their own public page, same-origin) and
  appended as additional sections in the same PDF, each starting on
  its own page.
- **Share** — uses the native Web Share API where the browser
  supports it (mobile browsers, most desktop browsers now); falls
  back to copying the page link to the clipboard.

**How "merge" works without a new API:** every research item page now
embeds its own structured data in a `<script type="application/json"
id="research-pdf-data">` block (built from data the page render
already computes — nothing new queried). To merge in a related item,
the client fetches *that item's own page* and reads the same block
back out of it via `DOMParser`. No new endpoint, no new permission
surface, and the data is guaranteed to match what a reader would see
if they visited that page directly.

**One honest limitation:** `dataset_table` sections (your gambling-tax
and enforcement datasets) can't be resolved into a PDF table the same
way — the public page fetches a dataset's live rows server-side,
which a client-side-only PDF export has no way to do without adding a
new endpoint. Rather than silently drop those sections or fake the
data, the PDF prints a plain note pointing back to the live page for
that table. Flagging this back to you: if you want dataset rows
embedded directly in the PDF too, that's a real, scoped follow-up
(one new read-only endpoint) — not something I wanted to bundle in
silently.

---

## 2. `/en/research` — classification and search

- **Search bar** — filters the already-rendered cards by title,
  excerpt, country, and related-entity text, live as you type
  (debounced).
- **Filter by type** — on the hub only (the per-type pages are
  already filtered by definition).
- **Filter by country** — populated from the actual countries present
  in the items being shown (Netherlands, Belgium, Germany, ... as you
  publish more).
- **Filter by relation** — populated from every regulator/topic/etc.
  each item is actually connected to via `research_relations` (e.g.
  filter to "Kansspelautoriteit" and see every item related to it).
  Each card also shows small tags for what it's related to, directly
  in the grid.
- **Works with JavaScript disabled** — every card is server-rendered
  exactly as before; the filter bar just shows/hides them. Nothing
  about the existing SEO-relevant server output changed.

**Why no new endpoint here either:** the hub already loads every
item it displays; the only genuinely new server-side work is one
batched relations lookup (`getRelationsFromMany` — one query for
however many items are on the page, not one query per item) so each
card can carry its "related to" tags and the filter dropdowns can be
populated.

---

## Files changed

**New**
- `en/static/js/research-pdf-export.js`
- `en/static/js/research-directory-filter.js`

**Modified (additive only)**
- `en/worker/database/research-relations.js` — new
  `getRelationsFromMany()` function; `getRelationsFrom`/`getRelationsTo`
  untouched.
- `en/worker/controllers.js` — `renderResearchItem` now also builds
  and embeds `research_pdf_data_json` (existing HTML render is
  unchanged); `renderResearchHub`/`renderResearchTypeList` now batch-fetch
  relations and enrich each card with `data-type`/`data-country`/
  `data-related`/`data-search` attributes and a small "related to" tag
  line — the cards' core markup and the pages' existing SEO
  metadata/schema output are unchanged.
- `en/templates/pages/research.html` — Download/Share buttons, the
  merge-related checklist panel, the embedded JSON block, and the 3
  new `<script>` tags (2 CDN, 1 local) — placed on this template only,
  not in `base.html`, so no other page on the site loads the PDF
  library.
- `en/templates/pages/research-list.html` — the filter/search bar
  markup and its one `<script>` tag.
- `en/templates/layout/base.html` — one attribute added to the
  existing `<body>` tag (`data-site-logo="{{site_logo}}"`, using the
  site-logo variable `render.js` already injects into every page) so
  the PDF script can find your logo without a new template variable
  or a second render pass.
- `en/static/css/research.css` — styling for the new toolbar, merge
  panel, card relation tags, and hub filter bar.

## Verification performed

- `node --check` on every new/modified `.js` file — clean.
- Full existing test suite: **201/201 passing, 0 failures** —
  unchanged.
- **Exercised `getRelationsFromMany` against real seeded data** via
  the same D1-shim technique used throughout this build, specifically
  including a zero-relations item (Belgium, no relations at all) in
  the same batch as a two-relations item (Netherlands) — confirmed
  the batch correctly returns an empty array for the zero-relations
  case rather than `undefined` or throwing, which is exactly the bug
  class a naive batch implementation gets wrong.
- Checked `{{#if}}...{{/if}}` tag balance in every touched template
  (this templating engine fails silently on a mismatched tag, so this
  was worth checking explicitly rather than assuming) — all balanced.
- **Caught and fixed one real bug before delivery**: the logo-loading
  code originally hardcoded `"PNG"` as the image format passed to
  jsPDF regardless of what your actual favicon/logo file type is — a
  `.ico` or `.svg` logo (both common) would have either thrown or
  rendered corrupted. Fixed to detect the real MIME type and only
  attempt to embed it if jsPDF actually supports that format
  (PNG/JPEG/WEBP), falling back to a clean text-only header otherwise
  — the same defensive pattern used everywhere else in this feature
  (a PDF should always generate successfully, even in degraded form).
- I could not runtime-test the actual PDF rendering pixel-output
  (jsPDF requires a real browser `document`/`canvas`, which isn't
  available in this environment) — every code path was carefully
  hand-reviewed instead, and every fallback (no autoTable plugin, no
  logo, fetch failure on a merged item, non-A4-supported image type)
  degrades to something that still produces a valid PDF rather than
  failing the whole export. **Please test the actual Download PDF
  button on a real published item after deploying** — that's the one
  part of this I'd genuinely like eyes-on confirmation of.

## Deploying

No migration.

```bash
cd ~/lummet
tar czf ~/lummet-tenant-backup-$(date +%Y%m%d-%H%M%S).tar.gz lummet-tenant
mkdir -p ~/lummet-integration-tmp && cd ~/lummet-integration-tmp
unzip -o ~/storage/downloads/research-pdf-and-hub-search.zip
diff -rq ~/lummet/lummet-tenant/en ~/lummet-integration-tmp/lummet-tenant/en
rsync -avc --dry-run ~/lummet-integration-tmp/lummet-tenant/en/ ~/lummet/lummet-tenant/en/
rsync -avc ~/lummet-integration-tmp/lummet-tenant/en/ ~/lummet/lummet-tenant/en/
cd ~/lummet/lummet-tenant/en
node --check worker/controllers.js && node --check worker/database/research-relations.js
node --test --test-concurrency=1 test/**/*.test.js
cd ~/lummet/lummet-tenant
rm -rf ~/lummet-integration-tmp
git add -A && git status
git commit -m "Research Engine: branded PDF export with related-research merge, and hub search/classification by type/country/relation"
git push
```

After deploy, on a real published item (e.g. your Netherlands country
page):
1. Click **Download PDF** — confirm it downloads, opens, shows your
   logo/branding in the header and the disclaimer in the footer, and
   the tables/timeline/claims/sources all render.
2. Check the **related research checklist** — check one or two boxes,
   download again, confirm the merged items appear as extra pages.
3. Click **Share** — confirm the native share sheet opens (mobile) or
   the link copies (desktop).
4. On `/en/research`, try the search box and each filter — confirm
   the count updates and "Clear filters" appears/works.
