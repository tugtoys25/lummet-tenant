# Phase 8: dashboard search and navigation

Built on `1yyperfectyyd1version` (Phase 1-7 final). One box finds screens, settings, modules and tools, and content,
for every person who can open the dashboard, and only what that person is allowed to see.

## What a person gets
- A **Search** button in the top bar of every dashboard screen, plus **Ctrl+K** (Cmd+K on a Mac) and **/** from anywhere
  that is not a text field.
- Before typing: **Pinned**, **Recent** and suggested screens. While typing: results grouped as Screens, Settings,
  Modules and tools, Content. Plain words work ("menu", "colours", "publish", "add casino") because screens carry synonyms.
- Keyboard: Up/Down move, Enter opens, Ctrl+Enter opens in a new tab, **Alt+S** pins or unpins, Esc closes (focus returns
  to where it was). Screen-reader ready: dialog, combobox and listbox roles, `aria-activedescendant`, a live status line
  that announces the result count. Full-screen on phones.
- Modules and tools show **On / Off**, so a switched-off thing can be found and turned back on in Configuration.

## What is searched (all generated, nothing is a second list to keep in sync)
| Kind | Source | Opens |
|---|---|---|
| Screens | the sidebar template, parsed (so a renamed or removed screen cannot linger) | the screen |
| Settings | every look-and-feel group and field, every editable list, the Configuration tools | the Configuration group / list |
| Modules and tools | the capability manifest (modules, pages, tools) with live On/Off | Configuration |
| Content | 16 sources by title or slug: casinos, reviews, news, pages, authors, categories, countries, research, content items, comparisons, landing pages, custom types, updates, payment methods, affiliate partners, media | the item's editor where one exists, else its list screen |

## Who may find what (decided on the server)
- Switched-off modules and tools: their screens and their content are not offered. Their capability entry stays, marked Off.
- Administrators find everything. Editors find a screen only if they may read its resource, never an administrator-only
  screen (mirrors `static/js/admin-permissions.js` and the API read gate). Visitor roles and signed-out callers get 403/401.
- Content is searched only in sources that are on for the site and readable by the role.

## Files
New: `worker/site-profile/dashboard-search.js` (index, content search, rules), `worker/site-profile/dashboard-favourites.js`,
`worker/api/routes/dashboard-search.js`, `static/js/dashboard-search.js`, `css-src/dashboard/10-dash-search.css`,
`migrations/0012_dashboard_favourites.sql`, tests `test/dashboard-search.test.js`, `test/dashboard-search-screen.test.js`.
Changed: `templates/layout/admin-nav.html` (Search button), `templates/layout/base.html` (script tag), `api/routes/index.js`,
`static/css/dashboard.css` and `worker/asset-version.js` (rebuilt with `npm run build:assets`).

API (staff only), prefix `/api/v1/dashboard/search`: `GET /index` (ETag, `private, no-cache`), `GET /content?q=`,
`GET|PUT|DELETE /favourites`. Writes refuse cross-site requests.

## Safety
- Content search is parameterised; `% _ \` are dropped like any symbol, so they never act as wildcards; at most 4 words of
  40 characters, 80 characters in total; 4 hits per source, 24 in all; a missing table only drops that source.
- Pins accept only `/en/dashboard...` links (no `//`, no `..`, no scheme), 30 per person, private to the person.
- The script never builds markup from text; every string is set as text.

## Deploy
1. Apply the patch, `npm test` in `lummet-tenant/en` (the suite was green: 134 files, 1943 tests).
2. Run `migrations/0012_dashboard_favourites.sql` on each tenant **before or after** the release. Without it the search
   works fully; only pinning answers "needs migration 0012" (and the pin is taken back). It is forward-only and idempotent.
3. No other setting, secret or binding is needed.

## Known limits (read before relying on it)
- **Not opened in a real browser.** The dialog is tested end to end against a hand-made DOM and the real API; the look
  (spacing, dark mode, phone layout) has only been written against the dashboard's own CSS variables. Check it once on staging.
- Content hits for reviews, news, pages, authors, categories, countries, research, updates, payment methods, affiliate
  partners and media open the **list screen**, not the item, because the dashboard has no per-item URL for them.
- Opening a look or list setting while already on the Configuration screen **reloads that screen** (those tabs only read
  the link when they load). The draft autosaves, but wait for "Saved" if you were mid-edit.
- Recents are kept **per browser** (localStorage); pins are per person on the server.
- A screen added to the sidebar later is findable at once by its label; add synonyms for it in `SCREEN_KEYWORDS`
  (a test fails if a synonym entry points at a screen that no longer exists).
- Per-screen permission names for a few screens (comparisons, research datasets, import history ...) follow the names in
  `api/gate.js`; if a site renames a resource, update `SCREEN_RESOURCE` (the same test guards stale keys).
- Search is not full-text over article bodies, only titles, names and slugs.
