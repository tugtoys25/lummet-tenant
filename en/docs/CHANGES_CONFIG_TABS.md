# Configuration screen: guided tabs

Presentation and navigation only. Nothing about what is saved, published, imported or restored changes.

**Migrations: none. API changes: none.**

## What changed
- `templates/pages/admin/configuration.html`: the eleven numbered sections are grouped into eight tab panels (Overview, Business type, Modules and tools, Homepage and pages, Design, Menus SEO and components, Backup and transfer, History). Every existing element id is kept, exactly once. The draft bar (`#cfgBar`) and the tab row sit in a sticky header; the publish summary and `#cfgSave` sit in a sticky footer that shows on every tab.
- `static/js/admin/configuration-tabs.js` (new): tablist behaviour (roving tabindex, Left/Right/Home/End), hash routing (`#tab-design`, `#tab-design/header`, and the old `#cfgPresets`, `#look-*`, `#rows-*`, `#cfgSetup` links), tab badges, Next/Back buttons, lazy-start hook `onFirstOpen`.
- `static/js/admin/configuration-progress.js` (new): setup checklist and tab badges from data the page already loads. No requests of its own.
- `static/js/admin/configuration.js`: three small hook calls and a tab switch in the "Choose a different type" handler. No logic rewrite.
- Lazy start: `configuration-draft.js` fetches the version and activity lists when History first opens; `configuration-look.js`, `configuration-rows.js` and `configuration-transfer.js` each begin with a four-line gate and start when Design, Menus or Backup first opens (at once if the tabs script is missing, or when a link lands on that tab). The bodies of those three scripts are otherwise unchanged.
- `css-src/dashboard/14-config-tabs.css` (new) and the generated `static/css/dashboard.css`; `worker/asset-version.js` regenerated. The new CSS also sets `overflow: visible` and `min-width: 0` on `#cfgRoot`: the shell gives `.admin-content` `overflow-y: auto`, which stops `position: sticky` from working (found in a real browser), and without `min-width: 0` the no-wrap tab row widens the page on phones.
- `templates/layout/base.html`: registers the two new scripts (tabs before draft, progress after configuration).

## Tests
- New: `test/config-tabs-dom.test.js` (28 tests) with `test/support/tabs-dom.js` (a small nested DOM). Covers: eight tabs in order with matching panels; every old id present exactly once and in the right tab; publish controls outside every panel; only one panel shown; keyboard; hash and Back/Forward; Next/Back; badges and checklist from fixtures; the three lazy scripts do not start until their tab opens; size caps; the sticky fix.
- Edited existing tests (assertions that looked for the old numbered headings or the old script list, nothing else): `admin-js-structure.test.js` (script list), `site-profile-screen.test.js` ("8. Menus..."), `site-profile-transfer-screen.test.js` ("9. Export, import and presets").
- The six guard tests (`config-a11y-dom`, `config-load-harness`, `config-performance-budget`, `config-security-hardening`, `config-system-flag`, `dashboard-shell`) pass unchanged.

## Assumptions
- Tab names are English only.
- A step on the Overview checklist counts as done once the welcome panel is confirmed or its tab has been opened (remembered for the browser session).
- Setup problems are assigned to a tab by their check id (homepage and redirect problems go to Homepage and pages, other checks to Modules and tools).

## [OPEN]
- The existing accessibility test fixes the order welcome panel, draft bar, help, presets, modules, Apply, history. To keep it unchanged, the footer sits in the page before the History panel and is moved to the bottom with CSS `order`. On the History tab the footer is therefore reached by keyboard before the history list.
- On a 375 px phone the pinned bar plus the pinned footer take roughly 40% of the screen height. Decide whether the footer should collapse to one line on phones.
- Not verified on a real phone, with a screen reader, or on the live dashboard (see evidence in the delivery message). `scroll-margin-top` values and the preview's sticky `top` are estimates.
