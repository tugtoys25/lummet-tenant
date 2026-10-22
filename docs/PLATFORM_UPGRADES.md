# Platform upgrades: research home, comparison, site search, dashboard add panel

Tenant v18. Nothing was removed or renamed. No database migration is needed. Every old
URL, API route, saved setting and template variable keeps working.

## 1. Research home (`/en/research`)

**Before:** "Featured research" showed up to 6 items and the list under it stopped at the 12
newest, so most published research was not reachable from the home page.

**Now**
- **Featured research** (editor's picks, max 6) is a separate block at the top.
- **All research** lists every published item (up to 5,000). Featured items also appear here,
  so nothing is hidden by being featured. The heading shows how many are published.
- **Sort** choice next to the filters: Newest first (default), Oldest first, Recently updated,
  Title A to Z, Title Z to A. It sorts instantly in the browser and also works from a link:
  `/en/research?sort=oldest`. Choosing Newest first removes the parameter.
- **Search and filters are unchanged.** Same box, same type/country/related filters, same
  matching on title, summary, country and related names. The "Showing X of Y" counter now counts
  each item once (featured items repeat in the full list).
- Each research type page (`/en/research/report`, ...) gets the same sort choice.

Files: `worker/controllers.js` (`renderResearchHub`, `RESEARCH_SORTS`, `sortResearchItems`),
`templates/pages/research-list.html`, `static/js/research-directory-filter.js`,
`static/css/research.css`.

## 2. Comparison pages (`/en/compare/{type}/{slug}`)

**Dashboard (Comparisons > create / edit)**
- A criterion is now **picked** from a list of what that type can be compared on instead of
  typing a key. Choosing one fills the label (still editable).
- **Add all comparable fields** adds every field in one click.
- **Custom key...** keeps the old manual entry, so existing comparisons open and save as before.
- The list comes from `GET /en/api/v1/comparison/fields?content_type=casino`.

| Type | Fields offered |
|---|---|
| Casino | rating, welcome bonus, bonus value, licence, operator, key features, accepted countries, restricted countries, website, featured |
| Sportsbook | rating, licence, licence country, website, featured, live betting, pre-match, cash out, mobile app |
| Affiliate partner | rating, licence, licence country, website, featured |
| Custom type | the common fields plus every field defined for that custom type (numbers, yes/no, lists, ratings, text, links) |

**Public page**
- A header card per item: logo, name, link, and an **Our pick** badge for the editorial pick.
- **Rating** row with stars, the number, and a **Best** marker on the highest rating.
- The criteria the editor chose come first, in the editor's order.
- **Every other field that at least one item has a value for is listed under "More details"**
  (or "Comparison details" when no criteria were saved), so the page always shows everything
  users can compare on. Empty values show a dash.
- Cells are typed: ticks and crosses for yes/no, chips for lists (first 8, then "+n"), a clean
  domain link for websites, escaped text for everything else.
- **Show differences only** hides rows where every item has the same value.
- A one-line summary names the highest rated item.
- On phones the table stays a table: the label column stays in place while items scroll
  sideways (the old stacked layout is kept for any other comparison table).

Files: `worker/comparison-fields.js` (new), `worker/controllers.js` (`renderComparison` and
helpers), `worker/api.js` (`comparison/fields`), `static/js/dashboard.js`,
`templates/pages/comparison.html`, `static/js/comparison.js` (new), `static/css/component-blocks.css`.

## 3. Site-wide search

**Before:** the header box searched casino names only (the list of casinos, in the browser).

**Now:** one box searches everything published and shows results under a title per type.

Groups: Casinos, Reviews, Research, News, Platform updates, Sportsbooks, Affiliate partners,
Authors, Pages. Only groups that have matches appear.

- Matches title, web address and for casinos the licence; research and news also match the
  summary. Titles that start with the typed words are listed first.
- Dropdown: up to 4 per group, a small logo where one exists, and
  **See all results** which opens `/en/search?q=...` (up to 20 per group, jump links to each
  group, its own search box). Pressing Enter does the same.
- Works for the desktop box and the phone search bar.
- Drafts, unpublished and future-dated content never appear. A group that fails (for example
  a table a site has not migrated) is skipped and never breaks the others.
- API: `GET /en/api/v1/public/search?q=term&limit=5` returns
  `{ query, total, groups: [{ key, label, count, items: [{ title, url, image, meta }] }] }`.
  It needs no sign-in, matches at least 2 characters, and treats `%` and `_` literally.
- `/en/search` is reserved, so no page or custom type can take that address. The results page
  is `noindex`.

Files: `worker/site-search.js` (new), `worker/api.js`, `worker/routes.js`, `worker/index.js`,
`worker/controllers.js` (`renderSiteSearch`), `templates/pages/search.html` (new),
`static/js/search.js`, `static/js/app.js` (the old phone handler steps aside),
`static/css/component-blocks.css`, `worker/breadcrumbs.js`, `worker/reserved-slugs.js`.

## 4. Dashboard: add and edit forms in a side panel

**Before:** on most dashboard pages the add form sat under a long list.

**Now:** an **+ Add ...** button sits at the top of the page. It opens the form in a panel that
slides in from the side (full screen on phones).

- The form itself is moved, not rebuilt, so every field, picker, rich editor, section builder
  and save script works exactly as before.
- **Edit** buttons fill the form and open the panel by themselves; the title changes to "Edit ...".
- **+ Add** while editing resets to a new item first (it uses the form's own Cancel button).
- A successful save closes the panel; an error keeps it open.
- Close with the cross, a click outside, or Esc. The arrows button switches between narrow and
  wide. Pickers (media, link) open above the panel.
- Pages: Affiliate accounts / partners / programs, Authors, Banners, Campaigns, Categories,
  Commercial terms, Countries, Country pages, Menu items, News, Offers, Pages, Payment methods,
  Postback integrations, Provider adapters, Reports, Research and datasets, Reviews, SEO,
  Tracking links, Platform updates, Components, Import history.
- A form can opt out with the attribute `data-no-panel`. Pages that are a single form (create
  and edit pages) are left alone, because they have no list in front of them.

Files: `static/js/admin-add-panel.js` (new), `static/css/header-hero.css`, `templates/layout/base.html`.

## Rollback

Everything is additive. Reverting the commit restores the previous behaviour; no data changes
were made.

## Tests

`test/site-upgrades.test.js` (13 tests) covers search grouping and hiding of drafts, the public
route, research sort wiring, field catalog, cell formatting, row building, the fields API, and
that every form listed for the panel exists in a template.

---

# Addendum (tenant v18.1): comparison design, custom values, top save bar

## 5. Comparison design and custom values

In the dashboard, Comparisons > create / edit has a new section **Design and custom values**.
Nothing is required: a comparison with no design looks exactly as before.

- **Whole table:** header, label column, cell, alternate-row and line colours, a highlight colour
  (the Best marker and Our pick), font (site, serif, elegant, rounded, classic, monospace),
  text size and corner shape.
- **Each item (column):** header background and text, column background and text, highlight and font.
- **Rows and custom values:** a grid with one row per criterion and one box per chosen item. A value
  typed there replaces the real value for that item only; empty keeps the real value. Each row also has
  **Row colours** (label and cell colours). **+ Add custom row** adds a new criterion with its own key
  and label, filled the same way, so a custom key and custom label get a full row of comparable values.
- Each colour has a clear button to go back to the site colour. The grid follows the items and criteria
  chosen above it.
- Order of precedence for a cell: the item's column colours, then the row's, then the whole table's.
- Safety: colours must be `#rrggbb`, fonts come from a fixed list, values are plain text (200 characters),
  everything is escaped on the page. Anything else is dropped when saved.
- Storage: one JSON document per comparison in the existing `settings` table under
  `comparison_design:{type}:{slug}` (no migration). It is removed when the comparison is deleted and when
  every design field is cleared. The comparison API (`create`, `update`, `get`) carries it as `design`.

Files: `worker/comparison-design.js` (new), `static/js/comparison-design.js` (new),
`worker/comparison-fields.js`, `worker/controllers.js`, `worker/api.js`, `static/js/dashboard.js`,
both comparison admin templates, `templates/pages/comparison.html`, `static/css/component-blocks.css`,
`static/css/header-hero.css`.

## 6. Create and edit pages: Save bar at the top

Pages that are one large form (casino, content item, generic review, comparison, landing page,
custom type, create and edit) have no list to move the form away from. They get a bar that stays at the
top while scrolling, with the page title and a **Save** button that submits the form.

---

# Addendum (tenant v18.2): comparison sections, related fields, remove item, list search

Nothing from v18 and v18.1 changed; all of this is added on top.

## 7. Comparison: content sections below the table

Comparisons > create / edit > **Design and custom values** has a new part,
**Content sections below the table**. It builds written content, shown under the table in the order set:
heading, text (blank line = new paragraph), list (bullets or numbers), highlighted note (information,
positive, warning), **picked items**, button / link, picture, divider line. No tables.
- **Picked items** open the same search dialog used elsewhere: casinos, news, research, authors, platform
  updates, sportsbooks, affiliate partners and custom content (up to 12 per block). They appear as text rows
  with a small picture, title, type, rating and summary. Unpublished or deleted items drop out by themselves.
- **Button / link** has a "Pick a page" button (pages, reviews, and the same content types); pictures have
  "Choose from Media".
- Up to 30 blocks. Text is plain and escaped on the page; links must start with `/` or `https://`.
- Stored in the comparison's design document (`sections`), so it needs no migration.

## 8. Comparison table: payment methods and categories

**Payment methods** and **Categories** are now comparable fields for every type, picked like any other
criterion (or shown automatically under "More details" when at least one item has them). They show what
each item is linked to on the site: casinos through their payment-method and category links, other types
through the generic content links. An item with none shows a dash.

## 9. Comparison page: remove an item

Each item header has a small **x**. It hides that column for the visit; **Restore ...** brings it back.
At least two items always stay. (In the dashboard, items are removed with the x next to each chosen item.)

## 10. Dashboard: search in every list

Every table in the dashboard (and the card lists of Inquiries and Submissions) gets, as soon as it has a row:
- a **search box** (all words must match anywhere in the row, ignoring the Edit/Delete buttons),
- a **"Showing X of Y"** count and a clear "No rows match" line,
- **click a heading to sort** (numbers sort as numbers),
- **/** jumps to the search box, **Esc** clears it.
Lists that load later or reload after a save keep working. Comparisons and generic reviews, which load one
page at a time, send the search to the server (`search=` on `comparisons/list` and `generic-reviews/list`),
so it covers every page. The content items list keeps its own search. A table can opt out with `data-no-search`.

Files: `static/js/admin-list-search.js` (new), `static/css/header-hero.css`, `static/js/dashboard.js`,
`worker/database/comparisons.js`, `worker/database/generic-reviews.js`, `worker/api.js`,
`worker/comparison-design.js`, `worker/comparison-fields.js`, `worker/controllers.js`,
`static/js/comparison-design.js`, `static/js/comparison.js`, `static/css/component-blocks.css`,
`templates/pages/comparison.html`, `templates/layout/base.html`.

## 11. Reviews for generic content: one screen, rich editor, real sections (v18.4)

Applies to reviews of sportsbooks, affiliate partners and custom content (casino reviews are untouched).

- **One route.** `/en/dashboard/reviews/generic` is the only screen: the list, `?new=1` (add) and `?edit=ID` (edit). Moving between them never reloads the page and the address follows the view, so back/forward and bookmarks work. The old addresses (`/en/dashboard/review/generic/create`, `/en/dashboard/generic-review/edit/ID`) still work and redirect here. Their templates stay in the repo, unused.
- **Rich editor for Content.** The review body uses the same editor as news and pages. Reviews written before this change as plain text are shown as paragraphs, in the editor and on the public page.
- **Sections that actually show.** Sections were saved by the old edit page but the public review page never printed them. They now appear after the Overview, in order, each with its own title and the full editor. The builder has quick-add chips (Overview, Features, Bonuses & promotions, Payments, Mobile experience, Customer support, Security & licensing, FAQ), move up/down, duplicate, collapse and remove. At most 30 sections, titles up to 120 characters. A section with a title but no text is saved but not shown publicly.
- **Pickers in every editor.** Two new toolbar buttons in the rich editor (everywhere it is used): **Page** links to a page, review, casino, news, research, author, update, sportsbook, affiliate partner or custom item; **Items** adds picked items as links with their picture, or adds a picked picture. Pictures and videos keep their existing buttons.
- **Safer.** Body and sections pass through the shared HTML sanitizer when the page is rendered. The slug is checked (lowercase letters, numbers, dashes) and duplicates get a clear message. An empty body (including only spaces/`&nbsp;`) is refused. Deleting a review now also deletes its sections, so a later review reusing the slug does not inherit them.
- **Editing comforts.** Sticky bar with Save, "Unsaved changes" indicator, Ctrl/Cmd+S, leave-page warning, slug filled from the title on new reviews, item filter, SEO length counters.
- **API.** `generic-review/create` and `/update` accept `sections: [{title, content}]` (omitted on update = unchanged); `generic-review/get` returns `sections`. No migration: sections use the existing `review_blocks` table.

## 12. Review sections of every kind, a sticky section bar, one public address, author hub (v18.5)

- **One public address per review.** Reviews of sportsbooks, affiliate partners and custom content live only at
  `/en/sportsbook/review/…`, `/en/affiliate-partner/review/…` and `/en/custom/{type}/review/…`. `/en/review/{slug}`,
  the `/en/review` list, the public review APIs, the weekly digest and the casino-only lists no longer show them. An old
  `/en/review/{slug}` link to a published generic review answers with a 301 to the real address (an unpublished one is a 404).
  Site search, the page picker and the sitemap use each review's real address.
- **Section types** (dashboard, generic review editor, "+ Add section"): Text (with size, alignment and width), FAQ,
  Images + text (one picture or a 2-4 column gallery, frame, shape, size, text before or after), Payment methods (pick one
  by one, "select all shown", "clear shown", search), Picked items (casinos, reviews, news, research, updates, authors,
  sportsbooks, partners, custom content, pages, as cards, grid, list or compact list, plus pages and links by address),
  Cards & grid (picture, title, text, link, 1-4 columns), Callout (info, tip, warning, good news) and Key figures. Sections
  are stored in `review_blocks` (no migration): plain HTML as before, typed ones as `lmsec:` + JSON, all validated on save
  and escaped or sanitized on the page. FAQ sections also add FAQPage markup.
- **Tables** inside review text and sections scroll sideways inside their own box; pictures and videos never overflow.
- **Sticky section bar** on review pages: Summary, How we scored it, Overview, every section you added, Pros & Cons,
  Verdict. It stays under the site header, highlights the section being read, scrolls itself on phones, jumps smoothly to a
  section, and has a thin reading-progress line. The same bar is used on author pages.
- **Search-and-choose fields.** The item a generic review is about, and the casino slug on the casino review form, are
  found by typing (arrow keys, Enter, Esc); the casino field refuses a slug that is not a real casino.
- **Author page** now shows what the author published, with counts: casino reviews, other reviews, research, news,
  platform updates, sportsbooks/partners/custom listings, comparisons, country and category pages, best-of lists and pages.
  Only content that is live is counted; groups with nothing are left out; each shows the first six, then "Show more".

## 13. Casino reviews get sections and the sticky bar (v18.6)

- The public casino review (`/en/review/slug`) prints every section type and shows the same sticky section bar. The bar lists only
  what is on the page (no dead tabs): Summary, Overview, Games, Bonuses, Payments, Licensing, More details, each section, Verdict,
  Pros & Cons, FAQ. FAQ sections also add FAQPage schema. Old plain blocks keep working (they show as text sections).
- The casino Reviews dashboard has a **Review sections** panel: search and pick a review, build sections with the same builder,
  press Save. `review-blocks/sync` accepts `sections` and checks them; `review-blocks/list` also returns typed `sections`.
- The classic one-block-at-a-time form stays. No migration.

## 14. Landing pages form, author pictures, no empty tabs (v18.7)

- **Landing pages (`/en/best/...`)**: the add and edit forms are now five clear steps (what it is about, items, page sections,
  publishing with author, search preview). Sections use the same builder as reviews (all eight types) and are stored in
  `review_blocks` under the key `landing:<slug>`; no migration. The public page shows an author line, a sticky section bar
  and the sections; FAQ sections add FAQPage schema. `content-landing-page/create|update` accept `sections` and `author_id`;
  `get` returns `sections`. Slugs are checked and duplicates refused. Deleting a page deletes its sections.
- **Author page**: research, platform updates and country pages now show their pictures when they have one.
- **Casino review**: the Pros & Cons tab and block, and every empty row of the Summary table, are left out when nothing was entered.

## 15. Show/hide checkboxes, reviews tabs, author look, clean jumps (v18.8)

- **Show checkbox on every section** (all builders: reviews, generic reviews, landing pages). Off = the section's content and its
  tab in the sticky bar are both left out. Stored as `hidden:true` inside the section.
- **Casino review page parts** (Summary, Overview, Games, Bonuses, Payments, Licensing, More details, Verdict, Pros and cons, FAQ,
  Related casinos) can be switched off per review in the new **Sections & page parts** tab. Stored in the settings table under
  `review_hidden:<slug>`, so no migration. `review-blocks/list` returns `parts` and `hidden_parts`; `review-blocks/sync` accepts `hidden_parts`.
- **Casino Reviews screen** has three tabs (All reviews, Add / edit review, Sections & page parts) and a Sections button on each row.
- **Author page look**: colours of count tiles, sections and cards, corner roundness and shadow are set in Authors > Author page look
  (settings `ah_*`, strict colour values only). Defaults are solid and clearly visible.
- **Count tiles and the top bar** share one jump: a single smooth scroll to the exact heading, corrected while pictures load, no hover wobble.
- Dropdowns and pickers in the admin are solid white with dark text.

### v18.9 note: author-page pictures
News, research and update cards on the author page now try the full picture first and fall back to the thumbnail (before, a missing
thumbnail file made the picture vanish).

## 16. Casino review form: show boxes on every field, tabs that always open the form (v19.0)

- Every field of the casino review form (Overview, Games, Bonuses, Payments, Licensing, Additional content, Verdict, Pros, Cons, FAQ)
  has a **Show on page** checkbox and a **Fold** button; the top of the form has **Show all / Hide all**. Unticked parts disappear
  from the public page and the sticky top bar. Saved straight away when editing, or right after creating a new review.
- The **+ Add / edit review** tab and the **+ Add review** button both open the form panel from any tab, every time
  (before, the tab showed an empty page because the form lives in the slide-in panel).

## 17. Landing pages show their picked and automatic items (v19.1)

An item with no country rules counted as "blocked everywhere", so a landing page (`/en/best/...`) with hand-picked or automatic
items showed none of them. Now only an item that has country rules and is blocked in the visitor's country is left out;
items without rules are shown (without an availability badge). The old test that encoded the previous default was updated.

## 18. Review summary card (v19.2)

The casino review "Review Summary" table is now a card: a rating block with star fill and score, a facts row (Casino, Reviewed by, Updated) and tiles for Best for, License, Payment methods and Bonuses. Long entries show a 150-character preview with a "Read more / Show less" toggle. Empty fields are skipped; the card disappears when nothing is filled. The hide/show checkbox for the summary still works. No migrations, no deletions.

## 19. Summary card on generic reviews (v19.3)

Sportsbook, affiliate-partner and custom reviews now use the same summary card as casino reviews: rating with star fill, then Item/Product, Reviewed by and Updated. Facts with no value are skipped. No migrations, no deletions.

## 20. Summary card colours (v19.4)

The summary card (casino and generic reviews) now has fixed colours: white background, dark text, light-grey tiles, amber stars and a "Read more" link. It no longer follows the site theme, so it stays readable in dark mode. CSS only; no migrations, no deletions.

## 21. Enterprise section cards (v19.5)

Review fields and sections (Overview, Games, Bonuses, Payment Methods, Licensing, More Details, Verdict, FAQ, related casinos, typed sections, Pros & Cons, scoring) now render as white cards: coloured accent edge, icon chip, title with divider, readable body text, check-mark lists, numbered steps, styled tables and quotes. The verdict has a gold highlight; pros and cons are green and red cards. Casino and generic reviews share it. Fixed light colours, so it reads on any theme. Removed a stray `{}` that was printed on casino reviews. Markup keeps all existing section ids, so the navigation bar and jump links are unchanged. No migrations, no deletions.

## 22. White section bar (v19.6)

The sticky section bar (casino reviews, generic reviews, author pages, landing pages) is now white with a soft shadow, dark tab text, a blue active tab and a blue progress line, matching the section cards. CSS only; no migrations, no deletions.

## 23. Review page look settings (v19.7)

Admin, Reviews, "All reviews" tab, bottom: **Review page look**. Pick the accent (active tab, progress line, links, icons, check marks), card background, card text, heading and border colours, corner roundness (0–32 px), card shadow (none / soft / strong), and whether each part keeps its own colour or all parts share the accent. A live preview shows the result; Save publishes it to casino, sportsbook, partner and custom review pages (settings keys `rl_*`). Only strict `#rrggbb` colours are accepted; anything else is ignored. "Back to defaults" restores the standard look. No migrations, no deletions.

## 24. Geo rules manager (v19.8)

Admin, Reviews, new **Geo rules** tab. One screen for the country rules of casinos (`geo_rules`) and of sportsbooks, affiliate partners and custom content (`content_geo`). It uses the same tables and the same decision the public pages already make; nothing about how visitors are evaluated changes.

- **List:** choose a type, search by name, see each item's mode (No rules, Allow-list, Block-list, Custom) and country count. "Show status in…" shows whether each item is available to visitors from a chosen country.
- **Edit an item:** allow only the listed countries, block the listed countries (allow all others), or custom (allowed or blocked per country). Add countries one by one or with presets; casinos also get an optional bonus override per country. A "Check a visitor's country" box shows the result and the reason as you edit, before saving. Unsaved changes ask before you leave.
- **Bulk:** select several items and set the same countries on all, copy another item's rules to them, or clear them (up to 200 at once, with confirmation).
- **CSV:** export a type's rules and import a CSV (`item_key, country_code, status, bonus_override`). The file is fully checked first; if any row is wrong nothing changes. Items in the file get exactly the rules in it; other items are untouched.
- **Presets:** one-click country groups (European Union, UK & Ireland, North America, Nordics, DACH by default). Edit, add or delete them (setting `geo_presets`).
- **Safety:** country codes must exist, statuses are only allowed or blocked, no duplicates, at most 300 rules per item. An item with no rules is treated as not available (existing behaviour, stated on the screen). Casino rule changes clear the public casino cache. Permissions: casinos need casino rights, other types need content rights.

API: `/api/v1/geo-manager/` meta, items, rules, export (GET); save, bulk, import, presets/save (POST). No migrations, no deletions.

## 25. Geo Rules section (v19.9)

A dedicated **Geo Rules** group in the admin menu, right after Insights, with six pages. Everything from v19.8 is kept (the Reviews tab still works and links to the full section). Nothing about how visitors are evaluated changes.

- **Rules** (`/en/dashboard/geo-rules`): the list and editor from v19.8. The editor now also takes typed country codes ("US, GB; de fr"), and a link such as `?type=casino&edit=<key>` opens an item straight in the editor.
- **Default rules** (`/defaults`): per type (casinos, sportsbooks, affiliate partners, custom) choose what an item gets when it is registered with no country rules: **not available** (today's behaviour, and the starting setting), **available to everyone** (allowed in every country on file) or **available to everyone except** a list (a block-list). It is applied when a casino or content item is created without its own rules; rules typed on the form always win, and clearing rules on an item later is still respected. "Apply to items without rules" gives the saved default to existing items that have none, with a count and a confirmation first. Stored in setting `geo_defaults`.
- **Bulk changes** (`/bulk`): pick a type, pick the items (tick them, or all items, only items without rules, only items with rules), then set, add to, or remove from their countries, copy another item's rules, give them the type's default, or clear them. Countries can be picked, chosen from presets, or typed as codes separated by commas, spaces or semicolons, with live feedback on codes that are wrong or not on file. A preview shows how many items change; applying asks for confirmation. Mixing allowed and blocked countries is reported, since it makes a custom list.
- **Import & export** (`/import-export`): CSV download per type; CSV import from a file or pasted text, checked fully first (nothing changes if any row is wrong).
- **Presets** (`/presets`): add, edit and delete the one-click country groups.
- **Country lookup** (`/lookup`): choose a country and see, for every type, which items its visitors can reach, filter by available or not, and jump to an item's rules.

API additions under `/api/v1/geo-manager/`: `defaults` (GET), `defaults/save`, `defaults/apply`; `bulk` now accepts `codes`, `merge` (replace, add, remove), `scope` (keys, all, no_rules, with_rules), `dry_run` and the actions `copy`, `default`, `clear`. No migrations, no deletions.

## 26. AI Studio and a wider public assistant (v20.0)

**What the AI could not do before.** The admin AI tools (reviews, SEO, FAQs, schema, outlines, rewrites) were written only for casinos, ignored sportsbooks, affiliate partners, custom content, research and news, could not translate or summarise, could not read a source, broke when the model wrapped its JSON in a code fence, and the public Lummet AI never looked at sportsbooks, partners, custom items or research at all.

**AI Studio** (`/en/dashboard/ai-studio`, Administration menu; the older AI Generator stays). Sixteen tools in five groups. Results are shown for review and editing; **nothing is published by the AI**.

- **Content:** item copy and SEO fields, full review, and FAQs for any casino, sportsbook, affiliate partner or custom item (written only from the item's saved facts, including custom fields and payment methods); compare 2 to 4 items.
- **Research:** research draft (type, topic, notes, pasted text and up to 3 web addresses), extract checkable claims, fact-check a draft against sources and saved claims, source brief with key points and open questions.
- **News:** article draft, 8 headline options, social posts for X, LinkedIn, Facebook and Telegram.
- **Language:** translate (keeps HTML, links and numbers), rewrite (readability, SEO, clarity, tone, expand, shorten, simplify, compliance clean-up), summarise.
- **SEO:** SEO title, description and keywords for any text, and tag suggestions.
- **Content audit** (no AI): published casinos, items, news and research that lack SEO, descriptions or excerpts, are overdue for review, or still have unverified claims, with a "Write copy" shortcut.

**Saving** is limited to: a news article as an **unpublished** draft marked AI-generated; a research item as a **draft** (never published); claims as **unverified**; and SEO/description fields on an item you chose (publish status is never touched; item-level access is checked). Model text is escaped before it becomes page HTML.

**Safety.** The model is told to use only the supplied facts. Pasted text and fetched pages are passed as data, with instructions inside them ignored. Web addresses are checked before reading: only http/https, no private or numeric addresses, no credentials, standard ports, redirects re-checked, 8 s timeout, size limits. Each tool needs the matching permission (casinos, content items, research, news); model calls are limited to 40 per user per 15 minutes; every generation is logged in `ai_generations`.

**Public assistant.** It now also finds published sportsbooks, affiliate partners and custom items (only those the visitor's country may see, using the same geo rules as the listing pages; items with no rules are never shown) and published research (quoting only **verified** claims), with links that pass the existing URL guard. The query planner knows the two new tables.

**Fixes.** Admin AI answers are parsed even when wrapped in code fences or extra text.

API: `/api/v1/ai-studio/` meta, items, audit (GET); run, apply, fetch (POST). No migrations, no deletions.

## 27. AI Studio history (v20.1)

AI Studio has a new **History** tab: when each tool was run and what was saved, by whom, with a one-line result (OK or Failed and why). Admins see everyone's history and can limit it to their own; other roles see only their own. Filter by tools run or things saved. Only the tool name, target item or slug, user and outcome are stored; **prompts and generated text are never stored**. Records older than 365 days are removed when something is saved.

Needs **migration 0062_ai_studio_history.sql** (one new table, nothing existing touched). Until it is applied AI Studio works as before and the tab says history is not switched on. API: `GET /api/v1/ai-studio/history` (`kind`, `mine`, `before`, `limit`).

## 28. Chat feedback and a one-tap migration workflow (v20.2)

**Thumbs on Lummet AI answers.** After each successful answer on the public chat, visitors see "Was this helpful?" with a thumbs up and a thumbs down. A thumbs down offers four quick reasons (Incorrect, Missing info, Unclear, Something else). Only the latest answer can be rated; a visitor can change their mind (the same answer is never counted twice). No login is needed, and rating is limited to 30 per visitor per 15 minutes.

**Privacy.** Nothing identifying is stored (no user id, no IP). For a thumbs down the question and answer are copied from the saved conversation on the server, never from the browser, so they cannot be forged; a thumbs up stores only the count. Rows are removed after 180 days. If migration 0063 is not applied the chat is unaffected and the thumbs simply do nothing.

**Admin view.** AI Studio, **Chat feedback** tab (admins only, because it contains visitors' questions): ratings in the last 30 days, the share that found answers helpful, how many thumbs-downs still wait for review, the most common reasons, and the list of rated-down questions with the answer given. "Mark reviewed" tidies the list.

**Migration workflow.** `.github/workflows/d1-migrate-file.yml` runs one migration file on every site database on both Cloudflare accounts (14 jobs; one failing does not stop the others): `gh workflow run d1-migrate-file.yml -f file=0063_ai_feedback.sql`. The file name is checked (`NNNN_name.sql`, must exist in `en/migrations`) and reaches the shell only through an environment variable. Needs the existing secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SECOND_CLOUDFLARE_API_TOKEN`, `SECOND_CLOUDFLARE_ACCOUNT_ID`). Migration 0062 (AI Studio history) and 0063 are both safe to run twice.

API: `POST /api/v1/ai/feedback` (public); `GET /api/v1/ai-studio/feedback`, `POST /api/v1/ai-studio/feedback/review` (admins). Rate limiting for AI Studio and feedback now share one small helper that no longer loses counts when two requests land in the same millisecond. Needs **migration 0063_ai_feedback.sql**. No deletions.

## 29. Fix a badly rated chat answer (v20.3)

In AI Studio, **Chat feedback** tab, every thumbs-down now has **Draft a fix**. It works in three honest steps:

1. **Coverage check:** it runs the same lookup the public chat uses on the visitor's question and shows what the site actually has (casinos, reviews, news, pages, FAQs, sportsbooks/partners/custom items, research).
2. **Nothing found:** the AI is not called and no answer is invented. The page says the site has nothing on the topic and offers "Start a research draft on this", with the question already filled in.
3. **Something found:** the AI drafts a 2-4 sentence FAQ answer from that material alone, plus a one-line guess at why the earlier answer failed. It may also say the material does not answer the question. Links in the draft are removed unless they came from the site's own content.

**Saving:** "Save as draft FAQ" adds a row to the FAQ list switched **off** (`is_active = 0`), so nothing goes live unreviewed, and marks the feedback item reviewed. Below the list, **Draft FAQs** shows the switched-off FAQs with **Switch on** (the public chat can then use it, because the chat already reads active FAQs), **Delete** (only while switched off) and a duplicate-question check. Admins only. Every draft and FAQ change is recorded in History. No migrations, no deletions.

API (admins): `POST /api/v1/ai-studio/feedback/fix`, `GET .../feedback/faqs`, `POST .../feedback/faq` (`activate`, `deactivate`, `delete`); save target `faq_draft`.

## 30. Weekly chat-quality digest (v20.4)

At the top of AI Studio's **Chat feedback** tab (admins only) a digest answers "is the chat getting better, and what should we write next?":

- **This week vs last week:** share of answers rated helpful, with the change in points.
- **By country** (28 days): helpful share and thumbs-down count for the countries with the most complaints.
- **Topics that keep getting thumbs-down** (28 days): the questions behind the thumbs-down are grouped by their most common meaningful word (filler words are ignored). For the top five topics the page also runs the same lookup the public chat uses and labels each **Site has content** (the chat should have answered; try Draft a fix) or **Site has nothing on this** (a content gap; **Start a research draft** opens the research tool with the question filled in).

No AI model is called, nothing is stored and there is no migration; it only reads `ai_feedback` (v20.2). With no data or no table it simply shows nothing. Admin only because it shows visitors' questions. Rate-limited like the other AI Studio routes.

API (admins): `GET /api/v1/ai-studio/feedback/digest`.

## 31. Draft a fix from the digest (v20.5)

Each topic in the chat-quality digest where the site **has content** now has its own **Draft a fix** button. It works on the topic's most recent thumbs-down question and uses exactly the flow from section 29: coverage check, a short FAQ drafted from the site's material alone, edit, then **Save as draft FAQ** (switched off until you turn it on under Draft FAQs). Topics where the site has nothing keep **Start a research draft**. No new route, no migration; only admins see it.

## 32. One public chat, two entrances (v21.0)

The floating widget (`/en/api/v1/ai/*`) and the dedicated page on the `lummet.<domain>` subdomain (`en/lummet/index.html`, routed by `worker/lummet/router.js`) now run through the **same server handlers** (`worker/ai/api.js`, `worker/ai/feedback.js`). Anything built for the chat applies to both: the sportsbooks, partners, custom items and research it can talk about, geo rules, the free-message limit and sign-in prompt, rate limits, 24-hour memory, and thumbs feedback.

What changed on the subdomain: the chat, streaming chat, clear-chat and feedback endpoints are the widget's own handlers (before, the subdomain kept a separate copy, which had drifted: no feedback, a different default country, no clear). The page gained the same thumbs row as the widget (same wording and reasons), and **+ New Chat** clears the saved conversation on the server. Feedback from both entrances lands in the same table and appears in AI Studio's Chat feedback tab and digest. The legacy paths `/api/chat`, `/api/chat/stream` stay; `/api/chat/clear` and `/api/feedback` are new. The admin panel on the page and its `/api/admin/*` routes are unchanged. No migration; nothing removed.

A test (`test/lummet-subdomain-parity.test.js`) sends the same question through both entrances and fails if their answers, memory, feedback or limits differ, or if the page's feedback wording drifts from the widget's.

## 33. Which entrance a rating came from (v21.1)

Each thumbs rating now remembers whether it came from the **floating widget** or the **lummet.<domain> page**. The server decides this from the request address (a browser cannot claim a different one), and older ratings stay unlabelled. The chat-quality digest in AI Studio shows "By entrance (28 days)" with the helpful share and number of ratings for each, so you can see whether one performs worse.

**Migration 0064** (`migrations/0064_ai_feedback_source.sql`) adds one nullable column, `ai_feedback.source`. It is purely additive. Run it once per site database (D1 console, or the `d1-migrate-file.yml` workflow with `file = 0064_ai_feedback_source.sql`); a second run reports "duplicate column name", which is harmless. Until it is run, ratings are still saved (without the entrance) and the digest simply omits the entrance line.

## 34. Content gaps (v21.2)

AI Studio has a new **Content gaps** tab (admins only). It lists questions that got a thumbs-down, not yet marked handled, from the last 60 days, grouped by topic, **where the site has nothing**: the same lookup the public chat uses finds nothing for the topic word and nothing for the question itself. Topics the site does cover are left out (those are for **Draft a fix** in the digest). Each gap offers:

- **Research draft** and **News article draft**: opens that tool with the question already filled in. Nothing is published; saving creates drafts as before.
- **Mark as handled**: marks every question in the topic reviewed so it leaves the list.

No AI model is called to build the list, nothing new is stored, no migration. API (admins): `GET /api/v1/ai-studio/feedback/gaps`, rate-limited like the other AI Studio routes. Covers ratings from both the widget and the lummet. page.

## 35. Weekly chat-quality email to admins (v21.3)

In AI Studio, Chat feedback tab, the digest has **Email me this report every week**, **Stop the weekly email** and **Send me one now**. It is **opt-in per admin**: nobody gets mail unless they turn it on for themselves, and only users who are still admin or super admin receive it. The email (about once every 7 days, checked by the existing 6-hourly schedule) contains this week against last week, the entrance comparison (when migration 0064 is in), the top thumbs-down topics, and the top three content gaps, with a link to AI Studio. Visitor questions are escaped. Nothing is sent when there is nothing to report, and no AI model is used.

Needs the same email setup as the other site emails (`RESEND_API_KEY` and `RESEND_FROM_EMAIL`); without it **Send me one now** shows the error and nothing breaks. The list of opted-in admins is stored as user ids in the existing `settings` table (key `ai_chat_report_to`); the 7-day marker is in `system_settings` (`chat_quality_report_last_attempt_at`). No migration. This job is not part of the admin cron-health list.

API (admins): `GET /api/v1/ai-studio/feedback/report` (your state), `POST` `{enabled}` (opt in or out for yourself) or `{send_now: true}` (sends only to you).

## 36. Chat settings: tone, topics to decline, extra guidance (v21.4)

AI Studio has a new **Chat settings** tab (admins only) with three optional settings for the public chat:

- **Tone:** Friendly (the default, no change), Professional (no slang, jokes or emojis), or Concise (three sentences or a short list unless asked for more).
- **Topics to politely decline:** up to 10 lines. The chat says briefly and kindly that it can't help with these here and offers to help with the site's content instead. The list is repeated right before the question so smaller models keep to it.
- **Extra guidance:** up to 500 characters of style or scope guidance, passed to the model as quoted notes.

They are stored in the existing `settings` table (`ai_chat_tone`, `ai_chat_decline`, `ai_chat_notes`) and read on every chat message by the one prompt builder that serves **both the floating widget and the lummet. page**, so both change together from the next message. The section sits **below** the built-in strict rules: it can make the chat shorter, more formal or more reserved, but cannot make it invent facts, links or sources. Nothing set means the prompt is unchanged. Saving is recorded in History as "Changed chat settings" (the text itself is not copied there); **Back to defaults** clears all three. Declining is done by the model, so it is reliable but not a hard filter; it is not a content-moderation system.

No migration. API (admins): `GET` and `POST /api/v1/ai-studio/chat-rules`.

## 37. Ask the chat: try settings before saving (v21.5)

In AI Studio, Chat settings, **Try it before you save** sends one question through the real chat (understand, retrieve, prompt, model, link and geo-fact guards) using the settings currently in the boxes, saved or not, and shows the answer. Use it to check a tone, or to confirm a declined topic is declined. It is admin only and rate-limited like the other AI Studio tools; it saves no conversation, counts against no free-message limit, writes no feedback or history, and never saves the settings. No migration. API (admins): `POST /api/v1/ai-studio/chat-rules/preview` with `{message, rules}`.

## 38. Speed: lean public pages, real caching, fewer repeat reads (v22.0)

Why pages felt slow: every public page loaded about 70 JavaScript files and 14 stylesheets, most of them admin tools a visitor never uses, two of them blocking the page, and the service worker kept serving old copies of scripts after a release.

- **Lean public pages.** Public pages now load 11 scripts and 12 stylesheets, all non-blocking. The dashboard and the signed-in user area (`/en/dashboard...`, `/en/user...`) keep the full set. `templates/layout/base.html` wraps the admin-only assets in `<!--@full-->` markers; `selectAssetSet` in `worker/render.js` strips or keeps them by path. A new admin script goes inside the markers.
- **Versioned assets.** CSS/JS URLs are rewritten to `?v=<hash>` and served with `cache-control: public, max-age=31536000, immutable`, so a repeat visit downloads nothing and a release is picked up at once. Other static files get a day with stale-while-revalidate; `sw.js` is never cached. The hash lives in the generated `worker/asset-version.js`. **After changing any file in `static/css` or `static/js`, run `node scripts/asset-version.mjs`**; a test fails if it is out of date, so a forgotten run cannot ship.
- **Service worker (v3).** No longer precaches; versioned files are cache-first, other static files stale-while-revalidate. Old caches are deleted on activate.
- **Fewer repeat reads.** `worker/cache.js` keeps a short (15 s) in-memory copy in front of KV, cleared at once by `invalidate()` in the same isolate; active banners are cached for 30 s. A change made in the dashboard can take up to about 15-30 s to appear on public pages.

No migration, nothing removed. Not changed: the 1.5 MB `static/images/elie.png` (not referenced by code; compress it before using it on a page).

## 39. Speed, server side: page cache and faster chat (v22.1)

- **Public page cache.** Content pages (casino, review, news, category, country, sportsbook, custom types, comparisons, authors, updates, lists and similar) are served from KV, one copy per country, instead of running about 15 database queries each time. Only anonymous GET requests with no query string and a 200 result are cached. A copy is served as-is for 5 minutes, then served once more while it is refreshed in the background, and is never kept longer than 15 minutes. The response carries `x-page-cache: hit` or `stale` when it came from the cache.
- **Analytics are unchanged.** When a page is rendered for the cache, the view events it fires (casino view, offer view, ...) are recorded with it. Every cache hit replays them with that visitor's own country, city and referrer, so view counts stay complete. A page that fires anything unexpected is never cached. The background refresh records events but does not write them, so nothing is counted twice.
- **Edits show at once.** Any successful admin save (any `/api/v1/` write other than visitor endpoints: auth, newsletter, user, analytics, ai, ai-studio, public, stats, report, search) changes a cache epoch, which retires every cached page. Changes made by the scheduler (scheduled publishing) appear within 5 to 15 minutes.
- **Chat.** Greetings and thanks no longer call the model to be understood, and the same first question asked again within 10 minutes reuses its plan. Follow-ups always use the model.
- **Fix.** The 30-second banner cache from v22.0 was below KV's 60-second minimum and was never stored; it is now 60 seconds.

No migration. Code: `worker/page-cache.js`, `worker/ai/understand.js`.

### Optional Cloudflare settings (not applied, not testable here)

Both go in `wrangler.jsonc`; try one at a time and revert if anything looks wrong.

1. `"placement": { "mode": "smart" }` at the top level. Cloudflare may run the Worker nearer your D1 database, which cuts the round-trip cost of database-heavy requests (dashboard, chat) and can slightly slow the rest. It needs traffic from several regions to take effect.
2. In `assets`, change `"run_worker_first": true` to `["/*", "!/static/*"]` so static files are served by Cloudflare directly without waking the Worker. Then the Worker no longer adds the cache headers or `?v=` handling to `/static/*` responses, so also add a file `en/_headers` containing `/static/*` followed by an indented line `Cache-Control: public, max-age=300, stale-while-revalidate=86400`. That is a shorter cache than the Worker gives versioned files today, so it trades some repeat-visit speed for lower Worker use; skip it unless Worker request counts are a problem.

## 40. Speed: fewer requests and database calls per visit (v22.2)

Measured by counting queries per page (warm cache): a casino page 9, a review 15, a news article 8, one chat message 14.

- **Browser caches the sidebar and geo lists.** Every public page fetched four to six small JSON lists on load (top casinos, news, categories, countries, geo status). They are now kept by the browser for 2 minutes (`private`, because some depend on the visitor's country), so moving between pages repeats none of those requests. Admin and other API responses are untouched.
- **Casino page asks for its own reviews only.** It used to download every review in full and filter in the browser; it now requests `/api/v1/public/casino-reviews?casino_slug=` which returns just title, rating and a 200-character excerpt. The "Your Region" box was filled by two scripts making the same request; one request remains.
- **Chat.** Old rate-limit rows are cleaned up on about 1 message in 20 instead of every message; the limit check itself is unchanged.

No migration. Remaining per-message chat queries are the conversation load/save, rate limit and free-tier checks, and retrieval; they are left as they are because each is needed for correctness.

## 41. Speed check (v22.3)

**Dashboard, Insights, Speed** (`/en/dashboard/speed`, admins only) shows how the public site is performing, from real visits:

- **Served from cache:** the share of sampled page views answered from the page cache (v22.1). Higher is faster; a low number right after a deploy or an admin save is normal, because saving retires the cache.
- **Cached page / Uncached page:** the typical server time (median) and the slowest 1 in 20 (95th percentile) for each.
- **Slowest pages:** pages with at least 3 samples, slowest first. These are the ones to look at if the site feels slow.
- **Asset version:** the hash behind the `?v=` on CSS and JS (section 38); it changes when a stylesheet or script changes.

How it works: about 1 in 10 public page views writes one row (path, cache state, milliseconds, country) to a new `perf_samples` table, after the response is sent, so it never slows a page. Rows older than 14 days are removed automatically. Times are server time, not the visitor's network. API (admins): `GET /api/v1/speed/summary`.

**Migration `0065_perf_samples.sql` is needed on each site database.** Until it is applied the page says so and nothing is recorded; the site is unaffected either way.

## 42. Instant home page and pages (v22.4)

Cause found for the very slow home page and slow pages generally: the public news list sent **every published article in full, text included, to every visitor on every page** (sidebar and home both asked for it), and the home page's own server render also loaded every article's full text from the database just to show 4 headlines. With many articles that is megabytes per visit and a heavy database read on every uncached render.

- **Short news list.** `/api/v1/public/news/list` now returns the latest 12 with a short excerpt (the first 300 characters of the text); `?q=` searches titles (up to 20). The home page reads only its 4 latest articles with a LIMIT query (`getLatestNews`) instead of all of them. A long list cached by an older version is trimmed on the way out.
- **Home page uses the same cache as every other page** (section 39): per country, retired instantly by any admin save, view events replayed. It previously had its own separate cache that an admin save did not clear.
- **A visitor never waits for a render that has happened before.** A cached page is served at once for up to a day, and refreshed in the background when older than 10 minutes. (Before, an unrefreshed copy vanished after 15 minutes to an hour, so on a quiet site almost every visitor waited for a cold render.) The refresh no longer writes a lock to KV, halving KV writes.
- **Warm-up.** The scheduled job (every 6 hours) re-renders the home page and the pages and countries your visitors actually use (from the Speed samples, section 41), so even the first visitor after a quiet spell gets a cached page.
- **See it.** Every cached-page response carries `Server-Timing: app;dur=<ms>, cache;desc="hit|stale|miss"`: browser Network tab, click the page request, Timing; or `curl -sD - https://your-domain/en | grep -i server-timing`.

No migration (the warm-up uses Speed samples only if migration 0065 is applied). Not changed: the `/en/news` list page still loads every article for its first (uncached) render; it is cached like other pages.

## 43. Cleanup: backups, patch files, zips and dead code (v22.5)

Housekeeping only; behaviour is unchanged.

- **Removed files:** leftover `*.patch` files in the repo root, `*.backup`, `*.bak-*`, `*.save`, `*backup*.css/js` copies, `legacywrangler.jsonc.backup`, `wrangler.jsonc.bestall`, an unused old chat (`level-ai.js`, `ai-chat.css`), an unused template, and modules nothing imports (`worker/seo.js`, `worker/database.js`, `worker/bootstrap.js`, `worker/ai/context.js`, `worker/ai/search.js`, `worker/item-access-test.js`). Git history still holds all of them.
- **Removed code:** functions whose names end in `backup` (including three old public news routes `/api/v1/newsbackup/list`, `/api/v1/newsbackup2/list`, `/api/v1/public/newsbackup/list`), functions no file references, unused imports, and long commented-out blocks in JS, CSS and templates.
- **Moved, not deleted:** old change notes and a one-off SQL fix are now in `docs/history/`.
- **Security note:** `docs/casinos/levelcasd1.sql` was a production database dump (it included sessions and password hashes). It is removed from the tree but stays in git history. Rotate admin passwords and invalidate sessions; if the repository was ever shared, purge it from history (for example with `git filter-repo`).
- `test/production-snapshot.test.js` stays; it skips visibly when no snapshot is present.

No migration.

## 44. Page cache moved off KV (v22.6)

On the free Cloudflare plan, KV allows only 1,000 writes a day. Once that was used up, every page save failed silently: visitors kept getting the last saved copy (`x-page-cache: stale`) and each visit started a pointless background re-render.

- **Pages and banners are now saved in the Cache API** (`worker/cache.js`: `getLocal` / `setLocal`): free and with no write limit. Each Cloudflare data centre keeps its own copy, so the first visitor in each data centre after a deploy or an admin save sees one normal render.
- **Admin saves still retire every page at once.** The epoch that does this is still one small KV value (a write only when you save in the admin), so it is not affected by the page traffic.
- **Fallback:** where the Cache API does not work (a `workers.dev` address accepts a save but never returns it) the first save is read back, and that isolate uses KV instead.
- **`x-page-store` header** on cached responses shows what the last save did: `cache`, `kv`, `failed` or `none`. `failed` means saves are being refused.
- Other KV caches (settings, navigation, related content) are unchanged; they write far less. If KV write errors still appear in the Worker logs, moving to the Workers Paid plan removes the limit entirely.

No migration.

## 45. Page cache fixes after the first live check (v22.7)

Live headers after v22.6 showed two problems.

- **Pages with a banner were never cached** (a casino page took 1-2 seconds on every visit). A banner records a view event with a small `metadata` block (component id and name, page type and slug); the cache treated any unknown field as unsafe and skipped the page. Plain `metadata` (values only, under 1,000 characters) is now allowed and replayed on every hit. Nested or visitor-specific fields still stop a page from being cached.
- **The reason is now visible.** `x-page-cache` says `hit`, `stale`, `miss`, or `skip:...` (`skip:event-field-<name>`, `skip:status`, `skip:type`).
- **Cache API fallback to KV after v22.6.** The first save is read back; the Cache API now uses your own domain in its keys (the cache belongs to a zone), a single missed read-back no longer switches it off, and `x-page-store` says `kv:probe-failed` or `kv:no-cache-api` when KV is used, so the cause is visible.

No migration.

## 46. Page cache: own-domain keys, gentler KV use (v22.8)

Live headers after v22.7 showed pages with a banner were now cached, but Cloudflare's cache still did not keep them: `x-page-store` showed `kv:probe-failed` / `kv:no-cache-api`, and some hits took about 400 ms (a cold KV read).

- **Cache keys now use the visitor's own domain** (the request's origin). `SITE_URL` is not set in the wrangler config, so v22.7 fell back to a made-up domain, which the Cache API may ignore.
- **Pages stay fresh for 30 minutes** (was 10) before a background refresh. Admin saves still retire every page at once, so edits show immediately. While KV is the fallback this cuts its writes to a third.
- **No pointless work when saves are refused:** if the last save failed, a stale page is still served but no background re-render is started.
- If `x-page-store` still shows `kv:...` after this, `SITE_URL` also needs to be set as a variable for the Worker (the scheduled warm-up needs it too).

No migration.

## 47. Page cache: patient read-back (v22.9)

After v22.8, `x-page-store` still showed `kv:probe-failed`: Cloudflare accepted a save into its cache but the immediate read-back found nothing, so the site fell back to KV (and its 1,000 writes a day on the free plan).

- The read-back now looks three times (now, +100 ms, +300 ms) before deciding that the cache does not keep pages, in case it only needs a moment.
- When it still fails, the header says which domain was used: `kv:probe-failed(level.casino)`.
- If it still fails, the cache is not available for that domain (for example a `workers.dev` address, or a zone setting that bypasses the cache), and the answer is to set `SITE_URL` and check how the domain is attached, or move to the Workers Paid plan (KV writes are then not a limit).

No migration.

## 48. Page cache: say where a page came from (v22.10)

After v22.9 the live headers could not show whether Cloudflare's cache or KV held a page: `x-page-store` only reports a save made in the same data centre that serves the request.

- **`x-page-source`** on every cached response: `cache` (Cloudflare's cache, a few ms) or `kv` (global store, slower on a first read from a data centre).
- **The first (miss) response now waits for its own save** (a few ms) so its `x-page-store` reports it: `cache`, `kv:probe-failed(host)`, `kv:no-cache-api` or `failed`.
- Reading the result: `x-page-source: cache` on repeat visits means the free, write-unlimited cache works. `kv` means pages are served from KV: still fast once warm, but limited by the free plan's 1,000 writes a day.

No migration.

## 49. Page cache: serve from memory, find the site address (v22.11)

The live headers after v22.10 settled the question: `x-page-store: kv:probe-failed(level.casino)` and `x-page-source: kv`. Cloudflare's own cache does not keep pages on this domain (the cause could not be found from outside), so pages are served from KV. That works and is fast when warm (6-12 ms), but a first read in a data centre, or after KV's one-minute edge copy lapses, takes 200-400 ms.

- **A warm isolate answers from its own memory** (`x-page-source: memory`): no KV read at all for up to 5 minutes per page (30 pages per isolate). Safe: the page key contains the admin-save epoch, so a retired page cannot come back from memory.
- **The epoch is re-read at most every 30 seconds** per isolate (was every 15 s plus a KV read each time); the isolate that handles an admin save sees it at once and drops its memory.
- **The first (miss) response no longer waits for its save** (the 22.10 wait is removed).
- **The scheduled warm-up works without `SITE_URL`:** the site's address is remembered from live traffic (one KV write, repeated only if it changes or after 30 days). Before, with no `SITE_URL`, the warm-up did nothing.
- Still limited by the free KV plan's 1,000 writes a day (page saves and refreshes). On the Workers Paid plan that limit is gone.

No migration.

## 51. Credential exposure clean-up (v22.13)

A production database dump (`docs/casinos/levelcasd1.sql` and `.zip`: users, password hashes, sessions) was committed to git history in the past. It was removed from the files in v22.5 but stays in history until the history is rewritten.

- **Migration 0066 (`0066_invalidate_sessions.sql`)** signs everybody out (`DELETE FROM sessions`) and cancels pending password-reset links (`DELETE FROM password_resets`). Run it once on every database. Users are kept.
- **Old password hashes are upgraded at login.** An account whose hash is the old unsalted SHA-256 (no `:` in it) is rewritten as salted PBKDF2 right after a successful sign-in. Those old hashes are the ones that can be cracked fastest, so the people who hold them should change their password anyway.
- **`docs/security/purge-history.sh`** removes the dump from the whole git history and drops the apply/revert noise commits. It makes a backup bundle first, refuses to run on uncommitted changes or unknown commits, and asks for typed confirmations (`PURGE`, then `PUSH`) before it force-pushes.
- Still to do by hand: change admin passwords; replace anything secret stored in the database (check the Settings pages for API keys); regenerate postback endpoint tokens if you use conversion postbacks; ask GitHub Support to clear cached views of the old commits.

Not changed: other tables that were in the dump (newsletter subscribers' emails, analytics) cannot be un-exposed; treat them as known to others.

## 52. API restructured into modules (v22.14)

`worker/api.js` was one function of about 5,500 lines (325 route blocks in a row) plus 800 lines of helpers. It is now a 52-line entry and 48 small files under `worker/api/`: `public.js` (signed-out routes), `gate.js` (sign-in and permission checks), `platform.js`, `helpers.js` and 43 route groups in `worker/api/routes/`, one per area. The layout, the request flow and how to add an endpoint are in `docs/ARCHITECTURE_API.md`.

- The route blocks were moved without editing them. A scripted comparison sent the same 3,392 requests (424 paths, 4 roles, GET and POST) to the old and the new code: 3,365 answers are identical.
- **One deliberate difference:** a validation error in 18 create/update/delete endpoints (for example "slug is required" on `casino/create`) used to escape the API's error handler and reach the site-wide maintenance fallback. It is now returned like every other API error: `500 {"success": false, "error": "slug is required"}`. The endpoints: `casino/create|update|delete`, `news/create|update|delete`, `page/create|update`, `review/create|update`, `platform-updates/create|update|delete`, `seo-pages/create|update|delete|generate-draft`, `ai/review`.
- Tests that read the API source as text now read all the API files through `test/support/api-source.js`. New `test/api-structure.test.js` guards the layout (every group registered, one place per route, entry file small, files under 600 lines) and the behaviour above.

No migration, no change to any page, style or script.

## 53. Page controllers restructured into modules (v22.15)

`worker/controllers.js` was 6,779 lines: 117 page functions and 87 helpers in one file. It is now a re-export file plus 25 files in `worker/controllers/` (one per area: casinos, reviews, news, research, dashboard, ...; four shared parts: `shared`, `ads`, `casino-cards`, `redirects`). Layout and how to change a page: `docs/ARCHITECTURE_CONTROLLERS.md`.

- The code was moved without editing it. Every file imports exactly what it uses (linted: no undefined names; every module loads; the facade exports the same 117 names).
- Checked on a seeded test database: 149 URLs, each fetched signed out and as admin (298 responses, 67 public pages and 131 admin responses with status 200): old and new are byte-identical.
- Tests that read the controllers as source text now read all the files through `test/support/controllers-source.js`. New `test/controllers-structure.test.js` guards the layout (5 tests).

No migration, no change to any page, style or script.

## 54. Admin script split into files (v22.16)

`static/js/admin.js` (8,051 lines, 202 functions) is now 27 plain scripts in `static/js/admin/`, loaded by `base.html` in the original place and order. The files joined in order are identical to the old file. `scripts/asset-version.mjs` also hashes sub-folders now. Layout, order rules and sizes: `docs/ARCHITECTURE_ADMIN_JS.md`.

- Checked in headless Chromium on 59 admin pages (dashboard, lists, forms, research, settings): the old single file and the 27 parts define the same global functions on every page (439), no page error, no unresolved inline handler.
- Tests that read the admin script as text now read all the parts (`test/support/admin-js-source.js`). New `test/admin-js-structure.test.js` (5 tests: file list and order, nothing orphaned, plain scripts, same functions and listeners when run one after another).
- Cost: 26 more script requests on an admin page (cached for a year per release).

No migration, no change to any page, style or behaviour.

## 55. Dashboard script split into files (v22.17)

`static/js/dashboard.js` (1,995 lines, 52 functions) is now 13 plain scripts in `static/js/dashboard/`, loaded by `base.html` in the original place and order. The files joined in order are identical to the old file. Layout and order rules: `docs/ARCHITECTURE_DASHBOARD_JS.md`.

- Checked in headless Chromium on 59 admin pages: the old file and the 13 parts define the same 439 global functions on every page, no page error, all 71 inline handlers resolve.
- Tests that read the script as text now read all the parts (`test/support/dashboard-js-source.js`). New `test/dashboard-js-structure.test.js` (5 tests).
- Cost: 12 more script requests on an admin page (cached for a year per release).

No migration, no change to any page, style or behaviour.

## 56. Rich editor split into ES modules (v22.18)

`static/js/rich-editor.js` (1,927 lines, one closure of ~60 functions) is now an entry module plus 12 modules in `static/js/rich-editor/`. `base.html` loads it as `<script type="module">` with an import map; `versionAssetUrls` puts `?v=<hash>` on the map, so parts are versioned like every other asset. The public `RichEditor` API is unchanged. Layout, imports and how to add a part: `docs/ARCHITECTURE_RICH_EDITOR.md`.

- Every top-level statement of the old file exists once in the new files, token for token (checked with a tokenizer); only `import`/`export` were added and the 4-space indent removed.
- Headless Chromium, 60 admin pages (10 with an editor), old vs new with a stubbed TinyMCE: the same `RichEditor` API, the same 374 TinyMCE calls and options, the same globals, the same console messages.
- Tests: new `test/rich-editor-structure.test.js` (5), a versioning test for the import map in `perf-assets`; `generic-review-editor.test.js` reads all parts through `test/support/rich-editor-source.js`.
- Needs a browser with import maps (Chrome 89+, Firefox 108+, Safari 16.4+), which is also what TinyMCE 7 needs for the admin.

No migration, no change to any page or behaviour.

## 57. Site settings split into modules (v22.19)

`worker/site-settings.js` (1,771 lines) is now a facade over 9 modules in `worker/site-settings/` (defaults, manifest, helpers, get-site-settings, homepage-cards, homepage-sections, analytics, compliance, theme). The public import path and API are unchanged. Layout and rules: `docs/ARCHITECTURE_SITE_SETTINGS.md`.

- Token for token the same code (only `import`/`export` lines added), imports generated from scope analysis.
- Differential: 6,535 calls of the eight public functions with 61 settings fuzzed 16 ways, plus homepage-section variants: identical output old vs new. 298 rendered pages (anonymous and admin): identical.
- New `test/site-settings-structure.test.js` (4 tests).

No migration, no change to any page or behaviour.

## 58. Request router split (v22.20)

`worker/index.js` (891 lines: a 143-case switch, the cron handler, the maintenance page, the cache wrapper) is now a 57-line wrapper plus `worker/app/`: `app-worker.js`, `scheduled.js`, `maintenance.js` and seven route groups in `worker/app/routes/`. Each group is one switch that returns `NOT_HANDLED` for other types, and `app-worker.js` tries them in turn, then the 404 page. Layout and rules: `docs/ARCHITECTURE_ROUTER.md`.

- Token for token the same: all 143 cases, the cron body, the maintenance page, the wrapper and the code before the switch (only imports moved and one dynamic import path became `../site-settings.js`).
- Differential old vs new: 298 rendered pages (anonymous and admin) identical; the cron run gives the same 11 background tasks, results and SQL.
- New `test/index-structure.test.js` (5 tests): wrapper size, group registry, one owner per route type, every `getRoute()` type has a case. Five older tests that read `index.js` as text use `test/support/index-source.js`.

No migration, no change to any page or behaviour.

## 59. Super API handlers split into modules (v22.21)

`worker/super/handlers.js` (1,359 lines, 123 handlers) is now a facade over 17 modules in `worker/super/handlers/` (helpers, system, casinos, reviews-news, pages-categories, research, payments-seo-meta, countries-authors, media, settings-users, components-blocks, permissions-access, review-blocks-ad-rules, nav-banners, platform-updates, seo-pages, inbox-subscribers). The router and every importer are unchanged. Layout and rules: `docs/ARCHITECTURE_SUPER_HANDLERS.md`.

- Token for token the same code (only `import`/`export` lines added), imports generated from scope analysis.
- Differential: all 123 handlers called 3,075 ways (5 ids x 5 bodies, including bad JSON and secret settings) against a seeded test database: identical status and body old vs new.
- New `test/super-handlers-structure.test.js` (4 tests).

No migration, no change to any behaviour.

## 60. AI retrieval split into modules (v22.22)

`worker/ai/retrieval.js` (1,230 lines) is now a facade over 6 modules in `worker/ai/retrieval/` (match-helpers, retrieve, search-helpers, context-string, url-guard, geo-guard). Importers are unchanged. Layout and rules: `docs/ARCHITECTURE_AI_RETRIEVAL.md`.

- Token for token the same code; imports generated from scope analysis.
- Differential: 1,212 calls (15 queries x 4 countries x 5 search plans through `retrieve`, `buildContextString`, `extractContextUrls`, `guardGeoFacts`, plus URL sanitizer cases) against a seeded test database: identical results old vs new.
- New `test/ai-retrieval-structure.test.js` (3 tests); `ai-studio.test.js` reads the parts through `test/support/retrieval-source.js`.

No migration, no change to any behaviour.

## 61. Template includes, and the settings page split (v22.23)

Templates can now include other templates: `<!--@include pages/admin/settings/general.html-->` is replaced by that file's exact text when the template is loaded (`expandIncludes` in `worker/render.js`; nested up to 4 levels; a missing part or a loop throws). `templates/pages/admin/settings.html` (1,275 lines) is a 54-line skeleton that includes 17 parts in `templates/pages/admin/settings/`. Details: `docs/ARCHITECTURE_TEMPLATE_INCLUDES.md`.

- The expanded template is byte-identical to the old file (checked while splitting), and the 298-page render differential (anonymous and admin, including `/en/dashboard/settings`) is identical.
- New `test/template-includes.test.js` (7 tests: expansion, `$` patterns, nesting, missing part, loop, `loadTemplate`, the settings layout). Three older tests that read the page as text use `test/support/template-source.js`.

No migration, no change to any page.

## 62. Homepage builder script cut in three (v22.24)

`static/js/admin/homepage-builder.js` (1,175 lines) is now `homepage-builder-items.js` (148), `homepage-builder-render.js` (852, one function) and `homepage-builder-collect.js` (178), loaded in the same place and order by `base.html`. Joined in order they are byte-identical to the old file (md5 checked). Browser check on 59 admin pages: same global functions, same unresolved-handler list, same console messages (old vs new); scripts per admin page 94 to 96. `test/admin-js-structure.test.js` has the new order. No migration, no behaviour change.

## 63. Media library split into ES modules (v22.25)

`static/js/media-library.js` (1,036 lines, one closure) is now an entry module plus 6 modules in `static/js/media-library/` (config, utils, actions, views, modals, events), loaded like the rich editor: `<script type="module">` and one shared import map in `base.html` (it now lists both editors' parts and sits before the first module script). The media page loads the entry as a module as well. `window.MediaLibrary.init/loadMedia/loadFolders` are unchanged. Details: `docs/ARCHITECTURE_MEDIA_LIBRARY.md`.

- Token for token the same code (only `import`/`export` added, indentation removed).
- Browser check on the media page with a mocked API, old vs new: the same screen after each of 10 interactions (filter, sort, search, clear, new-folder modal, close, page 2, item click, folder click, folder menu), the same 8 API requests, the same exports. The editor and global-function check on 60 admin pages is unchanged (no differences).
- New `test/media-library-structure.test.js` (3 tests); `rich-editor-structure.test.js` knows the shared import map.

The old "container not found" console message on admin pages (from the inline `"#media-library-container"` call in `base.html`) was already there and is unchanged.

No migration, no behaviour change.

## 64. Report engine split into modules (v22.26)

`worker/database/reports.js` (1,014 lines) is now a facade over 8 modules in `worker/database/reports/` (columns, handlers-core, reconciliation, cohort-ltv, operational-health, run, export, scheduling). Importers are unchanged. Details: `docs/ARCHITECTURE_DATABASE_REPORTS.md`.

- Token for token the same code, with one path fixed on purpose: the lazy `import('../reports/delivery.js')` in the scheduling part became `../../reports/delivery.js` (the first differential run caught it; a test now checks that every dynamic import resolves).
- Differential on a seeded affiliate graph with conversions, an import batch and three report definitions: 942 checks (19 report types x 3 users x 6 filter sets, with CSV and HTML output, column options, definitions, report runs and both schedule runners): identical old vs new.
- New `test/reports-structure.test.js` (3 tests).

No migration, no behaviour change.

## 65. Template renderer split into mixins (v22.27)

`worker/render.js` (908 lines, one class) now keeps the core of `Renderer` (constructor, `getSiteContext`, `loadTemplate`, `render`) and 20 other methods moved to five files in `worker/render/` (variables, components, navigation, seo, assets) plus `install-methods.js`, which defines them on the prototype exactly as a class body would. Exports and every importer are unchanged. Details: `docs/ARCHITECTURE_RENDERER.md`.

- Checked by loading both versions: the same 25 prototype members with the same descriptors (not enumerable, writable, configurable), the same function names, lengths and source text (apart from the lazy `import()` paths, which moved one folder deeper), the same `for...in` keys on an instance.
- 298 rendered pages (anonymous and admin): identical old vs new.
- New `test/render-structure.test.js` (4 tests).

No migration, no behaviour change.

## 66. AI retrieval: the 719-line `retrieve` function split into 15 searches (v22.28)

`worker/ai/retrieval/retrieve.js` (719 lines, one function) now only works out the search parameters and calls 15 functions, one per table group, in the old order. They live in 7 files in `worker/ai/retrieval/search/` (casinos, reviews and news, content and research items, platform updates, pages/FAQs/authors, countries/categories/SEO, payment methods/navigation/homepage sections). The code of every block is unchanged; each function gets the shared values through one `ctx` object. Details: `docs/ARCHITECTURE_AI_RETRIEVAL.md`.

- Every code line of the old function is present in the new files (checked line by line; only the function wrappers, imports and the `ctx` unpacking are new).
- Differential run, old vs new, against a seeded test database: 12,792 cases (26 queries x 4 countries x 40 plans, plus each of 14 tables failing) comparing the returned results, every SQL statement with its bound values in order, and every logged error. All identical. The same run does detect a swap of two calls.
- New tests in `test/ai-retrieval-structure.test.js` (4): file layout and size, call order and that `retrieve.js` runs no query itself, the shape of an empty result.

No migration, no behaviour change.

## 67. Big stylesheets generated from source parts (v22.29)

`main.css` (2,559 lines), `dashboard.css` (2,069) and `supportive.css` (1,948) are now written as 26 parts in `en/css-src/<name>/NN-title.css` and generated into the same single files in `static/css/` by `scripts/build-css.mjs` (committed, no build step at deploy; `--check` mode for tests). URLs, bytes and the asset version are unchanged: one request per stylesheet as before. Details: `docs/ARCHITECTURE_CSS.md`.

- Proof: the three generated files are byte-identical to the v22.28 files (`cmp`), and `node scripts/asset-version.mjs --check` still passes with the same hash.
- 11 new tests in `test/css-build.test.js`: generated = concatenation of parts, numbering and part size, every part brace-balanced, the scripts' `--check` pass. Editing a part without rebuilding fails the suite.
- Found, not changed: `supportive.css` line 403 leaves an `@media (max-width:520px){` unclosed, so its last ~1,540 lines apply only at 520px and below. Kept as is; to be fixed in its own release.

No migration, no behaviour change.

## 68. supportive.css: unclosed media query closed, text readable on the dark theme (v22.30)

The `@media (max-width:520px){` at line 403 of `supportive.css` was never closed, so ~1,540 lines (typography, readability, spacing, forms) applied only on phones. The brace is closed (`css-src/supportive/02-...`). Because those rules assumed a light page, a new part `css-src/supportive/08-theme-text-on-dark-surfaces.css` makes headings, section intros, admin headings and form labels on the page background follow the theme text colours (white cards keep dark text), and the `.main-content a` link rule is wrapped in `:where()` so component links keep their colours. Details: `docs/ARCHITECTURE_CSS.md`.

- Contrast audit, old vs new CSS, 88 pages x 3 widths: 1,379 elements newly readable, 0 got worse (thresholds 3 and 4.5), no new horizontal overflow, page height changes -62 to +248px.
- `test/css-build.test.js`: every part and every generated sheet must now be brace-balanced (an unclosed block fails the suite); the known-exception list is gone.
- Visible change on desktop and tablet: sidebar widget titles, dashboard card titles and several admin labels that were invisible are readable; typography sizes from sections 31/32 now apply everywhere; the hero badge text is white instead of gold.

No migration.

## 69. AI Studio split into 9 modules (v22.31)

`worker/ai/studio.js` (878 lines) is now a facade over `worker/ai/studio/` (config, text-utils, facts, tasks, run-task, apply-result, audit, history, http), made with the same generic splitter as the other server modules. Public names and import paths are unchanged. Details: `docs/ARCHITECTURE_STUDIO.md`.

- All 24 exports have identical names, function source text, `length` and values (TASKS compared deeply).
- Differential run, old vs new: 1,249 calls (every task x 5 inputs x 9 role/permission combinations, every route with GET and POST, `applyResult` with 6 targets, audit, history, feedback fix) with a fake model and a seeded database, comparing responses, every SQL statement with bound values, every prompt sent to the model and every logged error: all identical (261 distinct outcomes; a one-character message change is detected).
- The 141 existing studio-related tests pass unchanged. New `test/ai-studio-structure.test.js` (4 tests).

No migration, no behaviour change.

## 70. Homepage builder render function split (v22.32)

`static/js/admin/homepage-builder-render.js` (854 lines, one function) is now 4 classic scripts plus a 28-line entry: `homepage-builder-section.js` (`renderHomepageSectionShell`), `-content.js` (`renderHomepageParagraphs`, `renderHomepageCards`), `-controls.js` (`bindHomepageSectionControls`) and `-render.js` (`renderHomepageSections`). The four blocks shared no variables except `wrapper`, `section` and `sectionIndex`, which are now parameters. Order in `base.html`: items, section, content, controls, render, collect. See `docs/ARCHITECTURE_ADMIN_JS.md`.

- Token check: every token of the old file is in the new files; the only additions are the four function headers, their calls and one `return wrapper`. Template literal text is byte-identical (only code lines were re-indented).
- Headless Chromium on the settings page, old vs new: 8 section types rendered with quotes and HTML in the values, then 20 clicks (add/remove card and paragraph, move up/down, duplicate, remove section), a field edit and `collectHomepageSections()`; 23 snapshots of the HTML, the state array and the collected data are identical (a one-character label change is detected). 59 admin pages: same globals, handlers, editor setup and errors, apart from the four new function names.
- `test/admin-js-structure.test.js` updated for the new order.

No migration, no behaviour change.

## 71. Header & Hero admin script split into ES modules (v22.33)

`static/js/header-hero-admin.js` (811 lines, one IIFE) is now a 76-line module entry plus six parts in `static/js/header-hero-admin/` (state, fields, validate, repeater, preview, actions), wired by the import map in `base.html`. See `docs/ARCHITECTURE_HEADER_HERO_ADMIN.md`.

- Three deliberate code changes, all documented there: `if (!form) return;` became `if (form) { ... }` (no top-level `return` in a module), `setMobilePreview()` is the only writer of `mobilePreview`, and `"use strict"` is implicit.
- Token check: every token of the old file is in the new files except `"use strict"`, the `!`/`return` of the guard; additions are import/export lines, the `if`, and `setMobilePreview`.
- Headless Chromium on `/en/dashboard/header-hero`, old vs new: 117 snapshots (every one of the 66 form fields changed, every style preset, every repeater add and row button, colour clear, token insert, mobile/desktop preview, resize, invalid save, reset, discard, valid save) are **identical**, as is the save request body. A one-word change in a status message is detected.
- 59 admin pages: same output and the same errors as before.
- The first draft of the split did not build the repeaters (nothing imported `repeater.js`); the differential run caught it and the entry now imports it. `test/header-hero-admin-structure.test.js` (5 tests) guards this.

No migration.

## 72. Platform updates admin script split into 4 files (v22.34)

`static/js/admin/platform-updates.js` (793 lines) is now four classic scripts loaded in the same order: `platform-updates.js` (the list), `-form.js` (featured-image helpers, `initPlatformUpdateForm`), `-edit.js` (`editPlatformUpdate`) and `-actions.js` (delete, cancel, reset, alert, `formatDateTimeLocal`). The old file had only top-level function declarations, so the cut is by line range.

- The four files joined in load order are **byte-identical** to the old file (`cmp`).
- Headless Chromium on `/en/dashboard/updates`, old vs new: list render, edit of two rows and a missing one, cancel, update submit, create submit, success and error alerts, delete, image set/clear, `formatDateTimeLocal` on 5 inputs: 12 snapshots and the three request bodies are **identical**; a one-class change is detected. All 11 functions are still global.
- `test/admin-js-structure.test.js`: new order, plus a test that each part defines exactly its functions.

No migration, no behaviour change.

## 73. Router split into four ordered groups (v22.35)

`worker/routes.js` (714 lines, one function) is now a 37-line entry plus `worker/routing/{public,content,dashboard,system}.js`. Each group holds the original statements in the original order and returns `null` when nothing matches; `getRoute` returns the first hit, else `not_found`. See `docs/ARCHITECTURE_ROUTES.md`.

- Differential run, old vs new `getRoute`: 111,840 requests (every path literal and pattern in the file with sample segments, trailing slash, query, GET/POST/HEAD/DELETE) reach 143 distinct route types with **0 differences**; a one-word change to one route is detected (16 differences).
- No free variables in the new files except `parseInt`.
- New `test/routes-structure.test.js` (4 tests).

No migration, no behaviour change.

## 74. Research content builder split into 5 files (v22.36)

`static/js/admin/research-content-builder.js` (705 lines) is now five classic scripts loaded in the same order: `research-content-builder.js` (state, type lists, caches, editor helpers), `-fields.js` (per-type card renderers), `-sections.js` (card html, render, sync, defaults), `-wire.js` (`wireResearchSectionBuilder`) and `-init.js` (one-click templates, `initResearchForm`). Only the first part has top-level statements; the rest are function declarations, so the cut is by line range.

- The five files joined in load order are **byte-identical** to the old file (`cmp`).
- Headless Chromium on `/en/dashboard/research`, old vs new (clock and random fixed): all 12 section types added, fields edited, sync from the DOM, every button in the section cards (60 clicks), the four one-click templates and an unknown one, a submit: 65 snapshots of the cards and the state and the request body are **identical**. A one-word change in a template is detected.
- `test/admin-js-structure.test.js`: new load order and a test that each part defines its own functions.

No migration, no behaviour change.

## 75. Newsroom database layer split into 4 parts (v22.37)

`worker/database/newsroom.js` (704 lines) is now a facade over `worker/database/newsroom/{base,editorial,public,discovery}.js`, made with the generic splitter. See `docs/ARCHITECTURE_NEWSROOM_DB.md`.

- One deliberate move: the `LIVE` SQL constant went from the middle of the file to `base.js` (exported), because two parts use it.
- All 59 exports keep their names, source text and `length`. Token check: nothing is missing except the two import paths, which changed from `./` to `../`.
- Differential run, old vs new: 8,801 calls on all 49 exported functions (argument combinations, permissions, flags, state-changing calls in the same order) on a seeded database, with every SQL statement and bound value recorded: **0 differences** (709 distinct outcomes). A changed `ORDER BY` is detected (156 differences).
- New `test/newsroom-structure.test.js` (4 tests).

No migration, no behaviour change.

## 76. News controller split into 3 parts (v22.38)

`worker/controllers/news.js` (683 lines) is now a facade over `worker/controllers/news/{landing,article,list}.js`, made with the generic splitter. See `docs/ARCHITECTURE_NEWS_CONTROLLER.md`.

- Token check: nothing missing except the import paths (`../x.js` re-declared per part); no new code.
- Page-level differential, old vs new, through `worker.fetch`: 1,584 requests (36 URLs: news home with paging, search, filters, articles live/draft/scheduled/missing, redirect, section, region, country, topic, entity, series; 11 flag settings: all off, all on, each flag alone; with and without a session; GET and HEAD) compare status, headers and a hash of the body: **0 differences** (200, 301 and 404 all covered). Changing one flag name in a part is detected (40 differences).
- `test/support/controllers-source.js` also reads sub-folders of `worker/controllers/`. New `test/news-controller-structure.test.js` (4 tests).

No migration, no behaviour change.


## 77. Migrations rewritten: ordered, complete, no rollbacks (v22.39)

`en/migrations/` is now 20 files: `0001`–`0015` schema (125 tables, 229 indexes, 2 triggers, grouped by domain) and `0016`–`0020` seeds. Everything is idempotent. See `docs/MIGRATIONS.md`.

- Checked against the production export of 2026-10-19: tables, columns and their order, foreign keys, index and trigger SQL all equal. The only objects the export lacks are the three tables and five indexes of the newest changes.
- Seed data equals what the old files produced (permission ids aside). The navigation seed no longer duplicates on a second run.
- New `scripts/check-schema.mjs` compares any D1 export with the migrations and prints repair SQL. One-time data scripts moved to `en/ops/`.
- `d1-migrate-ai-free-tier.yml` now runs `0013_ai_assistant.sql`. `seed-admin.yml` reads the password from `secrets.ADMIN_PASSWORD` instead of the source.
- Test shim is strict; `test/migrations.test.js` (18 tests) guards the rules above. Removed: `schema-lummet.sql`, `production-snapshot.test.js`, two stray `router.js.before-*` files.

Known and not changed: `worker/lummet/admin-api.js` reads `users.password` and `sessions.token`, which no database has, so `/api/admin/login` of that module cannot work.

## 78. Header and hero module split into 3 parts (v22.40)

`worker/header-hero.js` (689 lines) is now a facade over `worker/header-hero/{schema,clean,render}.js`, made with the generic splitter. See `docs/ARCHITECTURE_HEADER_HERO.md`.

- All 27 exports keep their names. Token check: nothing missing except the import paths.
- Differential run, old vs new: 81,599 calls on every exported function (random and hostile values: markup, `javascript:` links, bad JSON, oversized text, video URLs, slides and cards, all `FIELDS`), 21,680 distinct outcomes: **0 differences**. Changing one pixel value in a part is detected (32 differences).
- New `test/header-hero-structure.test.js` (4 tests).

No migration, no behaviour change.

## 79. Site settings form script split into 4 files (v22.41)

`static/js/admin/settings-form.js` (675 lines, one function) is now an entry plus `settings-form-theme.js`, `settings-form-sections.js` and `settings-form-save.js`. See `docs/ARCHITECTURE_SETTINGS_FORM.md`.

- The statements are the same: all 443 non-blank lines of the old function appear, in order, in the new files. Only the function wrappers are new; the one shared value, the form element, is passed as an argument.
- Headless Chromium on `/en/dashboard/settings`, old vs new (generated ids normalised): every theme preset, all 12 colour inputs, both radius inputs, mouse enter and leave on the preview buttons, the four "add" buttons (7 clicks), edited fields, and four saves (success, HTTP error, `success:false`, success again) with the posted body and alert text: 39 snapshots and 4 request bodies **identical**. A changed alert message, and a changed preview value, are both detected.
- `test/admin-js-structure.test.js`: new load order. New `test/settings-form-structure.test.js` (3 tests).

No migration, no behaviour change.

## 80. Header and hero stylesheet written as 8 parts (v22.42)

`static/css/header-hero.css` (812 lines) is now generated from `css-src/header-hero/01…08-*.css` by `scripts/build-css.mjs`, like the three bigger sheets (`header-hero` is the fourth bundle). Parts: header and announcement bar, hero layout and colours, hero media and video, hero parts, admin hero editor, admin panels and search, generic reviews and section builder, geo rules and AI Studio. See `docs/ARCHITECTURE_CSS.md`.

- The generated file is **byte-identical** to the old one (`cmp`), so the browser, the URL and the asset version are unchanged.
- `test/css-build.test.js` now covers four bundles (numbering, size, brace balance, up-to-date check).

No migration, no behaviour change.

## 81. Responsive stylesheet written as 6 parts (v22.43)

`static/css/responsive.css` (742 lines) is now generated from `css-src/responsive/01…06-*.css` by `scripts/build-css.mjs` (fifth bundle). Parts: breakpoints and global tweaks, bottom navigation / sticky CTA / scroll-to-top, typography / admin tables / layout, footer / nav toggle / search / auth / chips, card refinements / logo / news search, full-bleed containers and card borders. The cuts are between top-level blocks, so the cascade order is unchanged. See `docs/ARCHITECTURE_CSS.md`.

- The generated file is **byte-identical** to the old one (`cmp`): same URL, same bytes, same asset version.
- `test/css-build.test.js` covers five bundles.

No migration, no behaviour change.

## 82. Research controller split into 3 parts (v22.44)

`worker/controllers/research.js` (668 lines) is now a facade over `worker/controllers/research/{sections,directory,pages}.js`, made with the generic splitter. See `docs/ARCHITECTURE_RESEARCH_CONTROLLER.md`.

- Token check: nothing missing except the import paths (`../x.js` re-declared per part); no new code.
- Page-level differential, old vs new, through `worker.fetch`: 244 requests (hub with all sort keys and a bad one, the seven type lists plus unknown and wrongly cased types, 14 item pages including a draft, bad JSON content and a bare array, every section type with valid and empty data, claims with sources, relations, a dataset table, site search with empty, short, long, markup and null-byte queries; with and without a session; GET and HEAD) compare status, headers and a hash of the body: **0 differences** (200 and 404 covered). Mutating one class name in each of the three parts is detected.
- New `test/research-controller-structure.test.js` (5 tests).

No migration, no behaviour change.

## 83. Component Studio script split into 8 parts (v22.45)

`static/js/component-studio.js` (649 lines, one function) is now an entry module plus `static/js/component-studio/{context,preview,widgets,forms,content,data,section,main}.js`, wired by the import map. See `docs/ARCHITECTURE_COMPONENT_STUDIO.md`.

- What changed in the code, and nothing else: the two values that are reassigned across parts (`S`, `busy`) are now `st.S` and `st.busy`; three element lookups got a `form &&` guard so the module can load on a page without the editor; the early `return` became a guard in the entry; the event wiring is one function, `initComponentStudio()`. Token check against the old file: the only differences are those, the imports/exports, and the removed `"use strict"` (modules are strict).
- Headless Chromium on `/en/dashboard/components`, old vs new (clock and random fixed, picker and media stubs): all 14 types; every field filled and toggled; up to 70 button clicks per type (add, remove, move, link, rich text commands); Advanced on and off; raw Settings and Content edits; `component:loaded`; reset; the invalid-Settings submit alert; mobile and desktop preview; five preview answers (ok, error with and without a message, network failure, empty): 200 snapshots, 129 preview and resolve requests and 11 alerts are **identical**; the old file run twice also matches itself, so the check is stable. Changing one message in each of four parts is detected.
- `test/component-studio-structure.test.js` (8 tests) and `test/support/component-studio-source.js`; `component-studio.test.js` reads all parts.

No migration, no server change.

## 84. Component Studio server module split into 5 parts (v22.46)

`worker/component-studio.js` (645 lines) is now a facade over `worker/component-studio/{shared,grid,table,section,dispatch}.js`, made with the generic splitter. See `docs/ARCHITECTURE_COMPONENT_STUDIO_SERVER.md`.

- All 21 exports keep their names and arity. Token check: nothing missing except the import paths.
- Differential run, old vs new: 28,799 calls on every exported function (hostile and random settings for the grid, table and section: wrong types, oversized lists, markup, `javascript:` links, bad slugs, pick lists with unknown sources, JSON text and non-JSON; renders against a seeded database with casinos, news, authors, research and updates) with 5,306 distinct outcomes: **0 differences**. One change in each of five parts is detected.

Also in this release: the release notes of v22.39 to v22.45 (`docs/RELEASE_*.md`) are back. Each earlier release had removed the previous one's note because the work tree did not contain it.

No migration, no behaviour change.

## 85. Authentication module split into 4 parts (v22.47)

`worker/auth.js` (622 lines) is now a facade over `worker/auth/{security,password,session,account}.js`, made with the generic splitter. See `docs/ARCHITECTURE_AUTH.md`.

- The 12 public exports keep their names; the helpers that were private are exported only between the parts. Token check: nothing missing except the import paths.
- Scenario differential, old vs new, with the clock, random numbers and Turnstile/Resend answers fixed: 313 steps (70 mixed register and login attempts with good and bad emails, passwords, tokens, IPs and hosts; a legacy SHA-256 account and its upgrade to PBKDF2; the rate limit hitting and then clearing as the clock moves 14.5 and 15.5 minutes; over 25 cookie shapes for `getCurrentUser` and `getCookie`; `requireRole` on every role pair; hashing and verifying, including odd stored hashes; forgot, reset and change password with the real emailed token; logout). Status codes, headers, bodies, the emails sent and the final contents of `users`, `sessions`, `password_resets`, `auth_attempts` and `newsletter_subscribers`: **0 differences**. Changing the iteration count, the rate-limit window or one message in a part is detected.
- New `test/auth-structure.test.js` (5 tests).

No migration, no behaviour change.

## 86. Public script app.js written as 5 parts (v22.48)

`static/js/app.js` (622 lines) is now generated from `js-src/app/01…05-*.js` by the new `scripts/build-js.mjs`, the script twin of the stylesheet build. It is built into the same single file because a public page must not load more scripts (the public set is capped at 12 by `test/perf-assets.test.js`). See `docs/ARCHITECTURE_JS.md`.

- The generated file is **byte-identical** to the old one (`cmp`): same URL, same bytes, same asset version, one request.
- `test/js-build.test.js` (5 tests): the file equals its parts, numbering, size, each part parses on its own, `base.html` still loads one `app.js`, `--check` passes.

No migration, no behaviour change.

## 87. Chat widget script lummet-ai.js written as 8 parts (v22.49)

`static/js/lummet-ai.js` (596 lines, one function wrapper) is now generated from `js-src/lummet-ai/_head.js`, eight numbered parts and `_tail.js` by `scripts/build-js.mjs`, which now supports a wrapper kept in `_head.js` and `_tail.js`. It stays one file, so the widget costs no extra request. See `docs/ARCHITECTURE_JS.md`.

- The generated file is **byte-identical** to the old one (`cmp`); `app.js` is unchanged.
- `test/js-build.test.js` now covers both scripts: each part is checked inside the wrapper, head and tail must go together, and `base.html` still loads one of each.

No migration, no behaviour change.

## 88. Analytics module written as 4 parts (v22.50)

`worker/database/analytics.js` (604 lines) is now a facade over `analytics/{events,metrics,conversions,aggregation}.js`, re-exporting the same 12 names. See `docs/ARCHITECTURE_ANALYTICS.md`.

- Proof: every export was run old against new on a seeded database (about 1,000 calls, valid and hostile inputs, six users with different item-access scopes, aggregation and backfill, a throwing database, the page-cache capture): all results and the resulting tables are identical. Mutation checks on each part were all detected.
- `test/analytics-structure.test.js` (6 tests): the public names, the facade shape, no cross-imports, scoping stays in `metrics.js`, one place for the event types and the backfill cap, part size.

No migration, no behaviour change.

## 89. Item-level access engine written as 5 parts (v22.51)

`worker/database/item-access.js` (469 lines) is now a facade over `item-access/{registry,policy,assignments,access,items}.js`, re-exporting the same 20 names. See `docs/ARCHITECTURE_ITEM_ACCESS.md`.

- Proof: every export was run old against new on a seeded database (about 5,000 calls): all resources, actions and scopes including invalid and unknown ones, 15 users (admin, viewer, editors with each scope, a missing user, string and zero ids), assignments, hostile slugs and ids, a throwing database. All results are identical. Mutation checks on each part (registry entries, owner columns, default scope, scope validation, admin bypass, unregistered resource, owner comparison, null owner, unknown scope, missing user, id lookup) were all detected.
- `test/item-access-structure.test.js` (6 tests).

No migration, no behaviour change.

## 90. Research PDF export script written as 5 parts (v22.52)

`static/js/research-pdf-export.js` (573 lines, one function wrapper) is now generated from `js-src/research-pdf-export/_head.js`, five numbered parts and `_tail.js` by `scripts/build-js.mjs`. It stays one file, loaded by the research item page only, so no request is added. See `docs/ARCHITECTURE_JS.md`.

- The generated file is **byte-identical** to the old one (`cmp`): same URL, same bytes, same asset version. Nothing else changed in the browser.
- `test/js-build.test.js` now covers three scripts (9 tests): the file equals its parts, each part parses inside the wrapper, and each page still loads one file per script. A deliberate edit to one part makes it fail.

No migration, no behaviour change.

## 91. Media upload module written as 5 parts (v22.53)

`worker/media-upload.js` (572 lines) is now a facade over `media-upload/{http,files,upload,delete,serve}.js`, re-exporting the same 8 names. See `docs/ARCHITECTURE_MEDIA_UPLOAD.md`.

- Proof: every export was run old against new with a fixed clock and seeded randomness against a seeded database and a recording R2 mock (about 900 calls): file validation over names, types and sizes at each limit, key and URL generation, byte ranges, 60 uploads (bad files, failing R2, no bucket, database down), deletes (owner, other editor, admin, viewer, missing, R2 failure) and serving (whole, ranges, HEAD, 304, missing, failing head). Responses, R2 calls, the saved rows and the logged errors are identical. Mutation checks on each part (limits, thumbnail widths, key shape, saved fields, owner rule, R2 delete, range maths, headers, status codes) were all detected.
- `test/media-upload-structure.test.js` (5 tests).

No migration, no behaviour change.

## 92. HTML sanitizer written as 4 parts (v22.54)

`worker/sanitize.js` (586 lines) is now a facade over `sanitize/{policy,values,tags,pipeline}.js`, re-exporting the same 4 names. See `docs/ARCHITECTURE_SANITIZE.md`.

- Proof: old and new were run side by side on 330,747 calls (about 87,000 of the inputs were changed by the sanitizer): a corpus of classic XSS payloads, 6,000 generated and randomly corrupted documents, every attribute on ten tags against 160 values (URLs with schemes hidden by tabs, entities and case, styles with expressions, comments and escapes, `target`, `rel`, booleans), mutated URLs and styles, and a second pass over its own output. All results are identical. Mutation checks on each part (tag and attribute lists, URL schemes, CSS patterns, entity decoding, control-character stripping, comment removal, `target` and `rel` rules, null bytes) were all detected. The only mutations not detected change nothing: a case flag on a name that is already lower-cased, and an iframe `http:` check that the earlier URL check makes unreachable (left as it was).
- `test/sanitize-structure.test.js` (6 tests).

No migration, no behaviour change.

## 93. Super API affiliate handlers written as 4 parts (v22.55)

`worker/super/handlers-affiliate.js` (544 lines) is now a facade over `handlers-affiliate/{shared,partners,commercial,integrations}.js`, re-exporting the same 40 handlers. See `docs/ARCHITECTURE_HANDLERS_AFFILIATE.md`.

- Proof: every handler was driven old against new through about 2,350 random operations on a real schema (create, edit, list with filters, get, delete, archive, rotate token) with valid, missing and hostile input, bad ids, bad JSON and foreign-key conflicts, with fixed clock and seeded randomness. Every status, header and body (list order and SQLite's own timestamps normalised), the final table counts and the offer version history are identical. Every handler succeeded at least once. Mutation checks on each part (response status and header, required fields, dependent checks, own-domain rule, change reason, limits, token field) were all detected; the only ones not detected are default arguments that no caller uses.
- `test/handlers-affiliate-structure.test.js` (6 tests).

No migration, no behaviour change.

## 94. AI Studio admin script written as 7 parts (v22.56)

`static/js/ai-studio.js` (540 lines, one function wrapper) is now generated from `js-src/ai-studio/_head.js`, seven numbered parts and `_tail.js` by `scripts/build-js.mjs`. It stays one file, so the dashboard makes no extra request. See `docs/ARCHITECTURE_JS.md`.

- The generated file is **byte-identical** to the old one (`cmp`): same URL, same bytes, same asset version.
- `test/js-build.test.js` now covers four scripts (11 tests): the file equals its parts, each part parses inside the wrapper, and each page still loads one file per script.

No migration, no behaviour change.

## 95. Newsroom admin script written as 7 parts (v22.57)

`static/js/newsroom-admin.js` (519 lines, one function wrapper) is now generated from `js-src/newsroom-admin/_head.js`, seven numbered parts and `_tail.js` by `scripts/build-js.mjs`. It stays one file, loaded only by the newsroom admin page. See `docs/ARCHITECTURE_JS.md`.

- The generated file is **byte-identical** to the old one (`cmp`): same URL, same bytes, same asset version. The existing tests that read it (safety rules and the vm end-to-end run) pass unchanged.
- `test/js-build.test.js` now covers five scripts (13 tests); the newsroom page must load exactly one `newsroom-admin.js`.

No migration, no behaviour change.

## 96. Content edit actions script written as 4 files (v22.58)

`static/js/admin/content-edit-actions.js` (515 lines, 14 global functions) is now four files loaded one after the other by `templates/layout/base.html`, the way the settings-form script was split in v22.41: `content-edit-actions.js` (deletes and review edit), `content-edit-news.js`, `content-edit-pages.js`, `content-edit-taxonomy.js` (category and country edit). See `docs/ARCHITECTURE_ADMIN_JS.md`.

- Proof: the four files joined in load order are **byte-identical** to the old file, and loading them as four separate scripts in one context defines exactly the same 14 functions with identical source as loading the old file.
- `test/admin-js-structure.test.js`: the order list has the three new files, the total of 209 top-level functions is unchanged, and a new test checks which file holds which function.

These are admin-only scripts (inside the `@full` block), so no public page gets an extra request. No migration, no behaviour change.

## 97. Super API router: the route table written as 5 files (v22.59)

`worker/super/router.js` (513 lines) kept 227 routes and the dispatcher in one file. The routes now live in `worker/super/routes/{core,affiliate,analytics,ai-newsroom,research}.js`; `router.js` (162 lines) joins them in the old order and keeps `matchRoute`, `actionForMethod` and `handleSuperApi`. See `docs/ARCHITECTURE_SUPER_ROUTER.md`.

- Proof: the table (order, method, path, handler, resource) is identical to the old one, and about 1,050 signed requests were run through `handleSuperApi` old against new on a real schema with a fixed clock and seeded randomness: every route with several ids, queries and bodies, wrong methods, no configuration (503), missing and wrong credentials, a stale, future and invalid timestamp, a bad signature, a replayed nonce, and a burst that hits the rate limit (429). Every status, header and body, and the whole audit log table, are identical. Mutation checks (resource names, a deleted route, a changed path, a swapped handler, an unknown-id decode, the 429 message, the audit action and success flag, the body reading, the internal error message) were all detected, apart from swapping the order of two groups that share no path, which changes nothing.
- `test/super-router-structure.test.js` (5 tests) compares the joined table with a fixture of the 227 routes; three tests that read the router's source now read it through `test/support/super-router-source.js`.

No migration, no behaviour change.

## 98. Component admin script written as 5 parts (v22.60)

`static/js/component-admin.js` (512 lines, global functions) is now generated from `js-src/component-admin/01…05-*.js` by `scripts/build-js.mjs`. No wrapper, so no head or tail. It stays one file at the same path, so the page loads it once and the two tests that read it are unchanged. See `docs/ARCHITECTURE_JS.md`.

- The generated file is **byte-identical** to the old one (`cmp`): same URL, same bytes, same asset version.
- `test/js-build.test.js` now covers six scripts (15 tests).

No migration, no behaviour change.
