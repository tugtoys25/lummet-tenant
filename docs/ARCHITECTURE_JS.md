# Architecture: public scripts built from parts (`en/js-src/` + `scripts/build-js.mjs`)

Six scripts are built this way: `app.js` (v22.48), `lummet-ai.js` (v22.49), `research-pdf-export.js` (v22.52) and the admin scripts `ai-studio.js` (v22.56), `newsroom-admin.js` (v22.57) and `component-admin.js` (v22.60).

## app.js

Since v22.48 `static/js/app.js` (622 lines) is written as five parts and generated into the same single file, the way the big stylesheets are (`docs/ARCHITECTURE_CSS.md`). A public page loads `app.js` once; splitting it into five script tags would add four requests to every page, and `test/perf-assets.test.js` limits the public scripts to 12.

| Part | Lines | Holds |
|---|---:|---|
| `js-src/app/01-nav-and-sidebar.js` | 153 | The page-ready start-up list, mobile nav toggle, sidebar casinos, news and categories |
| `js-src/app/02-sidebar-countries-home-news-auth.js` | 160 | Sidebar countries with search, home page news, header sign-in state |
| `js-src/app/03-mobile-search-nav-scroll-top.js` | 108 | Mobile search toggle, bottom navigation state, scroll-to-top button |
| `js-src/app/04-casino-bookmarks-init.js` | 62 | Bookmarks start-up |
| `js-src/app/05-bonus-toggle-and-bookmark-buttons.js` | 139 | Bonus row expand/collapse, bookmark buttons and toggling |

The generated file is **byte-identical** to the old one, so the URL, the bytes and the asset version are unchanged. It is a classic script: the order of the parts is the order the code runs in. Each part is whole top-level statements and is checked on its own (`test/js-build.test.js`).

```bash
node scripts/build-js.mjs          # write static/js/app.js
node scripts/build-js.mjs --check  # fail if it is out of date
node scripts/asset-version.mjs     # then refresh the asset version
```

## lummet-ai.js (the chat widget)

`static/js/lummet-ai.js` (596 lines) is one function wrapper (`(function () { 'use strict'; ... })();`) whose functions share the widget state. It is built into the same single file from `js-src/lummet-ai/`. The wrapper's first lines are in `_head.js` and its last line in `_tail.js`; the numbered parts are the statements inside it, in order. Each part is checked by wrapping it in the head and tail, so a part that closes a block it did not open fails the test.

| Part | Lines | Holds |
|---|---:|---|
| `_head.js` | 7 | File comment, `(function () {`, `'use strict'` |
| `01-state.js` | 13 | Widget state, storage keys, element variables |
| `02-session-and-suggestions.js` | 47 | Session id (survives reloads and login), suggestion chips |
| `03-init.js` | 106 | `init()`: builds the widget and wires its events |
| `04-window-and-input.js` | 28 | Open, close, toggle, auto-resize, Enter key |
| `05-send-and-stream.js` | 135 | `sendMessage`, streamed answer handling |
| `06-auth-gate-and-messages.js` | 63 | Sign-in gate, remaining counter, `addMessage` |
| `07-feedback-and-follow-ups.js` | 82 | Thumbs up/down, follow-up suggestions |
| `08-typing-scroll-clear-markdown.js` | 114 | Typing indicator, scrolling, clear conversation, markdown and escaping, start |
| `_tail.js` | 1 | `})();` |

The generated file is **byte-identical** to the old one: same URL, bytes and asset version.

## research-pdf-export.js (the research PDF download)

`static/js/research-pdf-export.js` (573 lines) is one function wrapper loaded only by the research item page (`templates/pages/research.html`). Built into the same single file from `js-src/research-pdf-export/`; the opening comment and `(function () {` are in `_head.js`, the closing `})();` in `_tail.js`.

| Part | Lines | Holds |
|---|---:|---|
| `_head.js` | 26 | The explanatory header comment, `(function () {` |
| `01-helpers.js` | 95 | Page constants, stage errors, reading the embedded PDF data, slug and HTML to paragraphs, logo loading |
| `02-drawing.js` | 128 | The page cursor, headings, paragraphs, rules, tables (AutoTable with a text fallback) |
| `03-sections.js` | 129 | Sections by type, claims, sources, item cover and sections |
| `04-export.js` | 115 | Header and footer on every page, `exportResearchPdf` (named stages, related items merged) |
| `05-page.js` | 79 | Status line, merge options, the download and share buttons |
| `_tail.js` | 1 | `})();` |

The generated file is **byte-identical** to the old one: same URL, bytes and asset version. `test/js-build.test.js` checks that this page still loads one `research-pdf-export.js` and no part files.

## ai-studio.js (the AI Studio admin screen)

`static/js/ai-studio.js` (540 lines) is one function wrapper loaded by the dashboard layout (`templates/layout/base.html`). It is an admin script, but it is built into one file the same way, so the page makes no extra request and the file keeps one URL and one asset version. The header comment and `(function () {` are in `_head.js`, the closing `})();` in `_tail.js`. All state is the single `S` object and the helpers `el`, `api` and `say`, so the parts share them as they did inside the wrapper.

| Part | Lines | Holds |
|---|---:|---|
| `_head.js` | 3 | Header comment, `(function () {` |
| `01-core.js` | 63 | `root` check, state, DOM helper `el`, `api`, `say`, `taskInfo`, `labelled`, `picker`, item types |
| `02-screens-and-run.js` | 121 | `render`, tool list, the form, chips, `run`, `field`, copy button, `save` |
| `03-result.js` | 69 | `renderResult` |
| `04-chat-settings-and-gaps.js` | 86 | Chat settings (`renderRules`) and content gaps |
| `05-chat-feedback.js` | 134 | Chat feedback, its report toggle, digest, draft fix, draft FAQs |
| `06-history-and-audit.js` | 58 | History and content audit |
| `07-start.js` | 5 | Loads the tool list and draws the first screen |
| `_tail.js` | 1 | `})();` |

The generated file is **byte-identical** to the old one.

## newsroom-admin.js (the newsroom admin page)

`static/js/newsroom-admin.js` (519 lines) is one function wrapper loaded only by the newsroom admin page (`templates/pages/admin/newsroom.html`); public pages must not load it (a test checks). Built into one file from `js-src/newsroom-admin/`, so the page makes no extra request. The header comment and `(function () {` are in `_head.js`, the closing `})();` in `_tail.js`. The shared state (`state`, the `h` DOM helper, `api`, `notify`) is in part 01 and used by the others as before.

| Part | Lines | Holds |
|---|---:|---|
| `_head.js` | 6 | Header comment (no `innerHTML` rule), `(function () {` |
| `01-core.js` | 47 | `API`, `state`, DOM helper `h`, `put`, `$`, `label`, `notify`, `api` |
| `02-tabs-and-queues.js` | 43 | `setTab`, `renderQueues` |
| `03-article.js` | 143 | `renderArticle` (the article editor) |
| `04-taxonomy-and-homepage.js` | 84 | Taxonomy, region mapping, homepage pins |
| `05-search-and-analytics.js` | 92 | Search index maintenance, analytics, article performance |
| `06-authors-flags-policies.js` | 96 | Authors, flags, policies |
| `07-start.js` | 7 | On page load: tabs and first panel |
| `_tail.js` | 1 | `})();` |

The generated file is **byte-identical** to the old one. `test/newsroom-admin-ui.test.js` (safety rules: no HTML sinks, same-origin API only) and `test/newsroom-admin-ui-e2e.test.js` (runs the real script in a vm against a fake page) read the generated file and still pass.

## component-admin.js (components, assignments, SEO meta)

`static/js/component-admin.js` (512 lines) is a classic script of global functions with one `DOMContentLoaded` handler and one top-level `let currentFilter`. It has no function wrapper, so there is no head or tail; the five parts are joined as they are into the same single file, still loaded once by `templates/layout/base.html` (admin block). The file keeps its path, so the tests that read it (`component-hero`, `component-page-types`) are unchanged.

| Part | Lines | Holds |
|---|---:|---|
| `01-components.js` | 150 | The `DOMContentLoaded` handler, `currentFilter`, components table, delete, component form |
| `02-assignments.js` | 140 | Assign form, component dropdown, assignments table, toggle and remove |
| `03-seo-meta.js` | 103 | SEO meta admin: table, form, delete |
| `04-edit-actions.js` | 83 | Edit and cancel for a component, an assignment and SEO meta |
| `05-custom-page-types.js` | 36 | Page types for custom content types |

The generated file is **byte-identical** to the old one.
