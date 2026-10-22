# Architecture: the admin script (`static/js/admin/`)

Since v22.16 the old `static/js/admin.js` (8,051 lines) is 27 files in `en/static/js/admin/` (29 since v22.24, when the homepage builder was cut in three; numbers 6a and 6b below). They are plain classic scripts, loaded one after another by `templates/layout/base.html` in the admin-only block, exactly where `admin.js` was. Nothing else changed: the files, joined in the order below, are byte-for-byte the old file.

## Why the order matters

The scripts share one global scope, like the single file did. Functions are called from inline `onclick` handlers, top-level `const`/`let` values are used by later files, and four `DOMContentLoaded` handlers run in the order they were registered. So:

- keep the order of the `<script>` lines in `base.html` (a test checks it);
- a new file goes into `static/js/admin/` **and** into that list;
- do not add `import`/`export` (these are not modules).

## Files, in load order

| # | File | Holds | Lines |
|---|---|---|---:|
| 1 | `admin/init.js` | First DOMContentLoaded handler: starts the review, news, page, settings and research loaders | 33 |
| 2 | `admin/reviews.js` | Reviews table and review form | 136 |
| 3 | `admin/news.js` | News table, news form, image pickers | 229 |
| 4 | `admin/pages.js` | Pages table and page form | 110 |
| 5 | `admin/settings.js` | Settings form loader and compliance rows | 381 |
| 6 | `admin/homepage-builder-items.js` | Homepage builder: the section list, id and escape helpers, new card and new section | 148 |
| 6a | `admin/homepage-builder-section.js` | Homepage builder: `renderHomepageSectionShell` (the section card with its fields) | 330 |
| 6b | `admin/homepage-builder-content.js` | Homepage builder: `renderHomepageParagraphs`, `renderHomepageCards` | 351 |
| 6c | `admin/homepage-builder-controls.js` | Homepage builder: `bindHomepageSectionControls` (move, duplicate, remove, add) | 160 |
| 6d | `admin/homepage-builder-render.js` | Homepage builder: `renderHomepageSections` (entry: loops over the sections and calls the four above) | 28 |
| 6e | `admin/homepage-builder-collect.js` | Homepage builder: `collectHomepageSections` | 178 |
| 7 | `admin/theme-presets.js` | Theme presets | 174 |
| 8 | `admin/settings-form.js` | Settings form submit and wiring | 676 |
| 9 | `admin/ai-generator.js` | AI review generator | 69 |
| 10 | `admin/categories.js` | Categories table and form | 167 |
| 11 | `admin/countries.js` | Countries table and form | 192 |
| 12 | `admin/research.js` | Research items table | 148 |
| 13 | `admin/research-content-builder.js` | Research content builder: section state, type lists, item/dataset caches, editor helpers | 94 |
| 13a | `admin/research-content-fields.js` | Research content builder: the per-type card body renderers | 200 |
| 13b | `admin/research-content-sections.js` | Research content builder: card html, `renderResearchFormSections`, sync from DOM, defaults | 146 |
| 13c | `admin/research-content-wire.js` | Research content builder: `wireResearchSectionBuilder` (all the buttons) | 163 |
| 13d | `admin/research-content-init.js` | Research content builder: one-click templates and `initResearchForm` | 103 |
| 14 | `admin/research-sources-claims.js` | Research sources and claims | 315 |
| 15 | `admin/research-relations.js` | Research relations | 162 |
| 16 | `admin/research-versions.js` | Research version history | 108 |
| 17 | `admin/research-review-queue.js` | Research review queue | 145 |
| 18 | `admin/research-datasets.js` | Research datasets (spreadsheet-style grid) | 368 |
| 19 | `admin/content-edit-actions.js` | Edit and delete actions for reviews, news, pages, categories, countries | 516 |
| 20 | `admin/payment-methods.js` | Payment methods | 289 |
| 21 | `admin/platform-updates.js` | Platform updates: `loadPlatformUpdatesTable` (the list) | 143 |
| 21a | `admin/platform-updates-form.js` | Platform updates: featured-image helpers, `initPlatformUpdateForm` (submit) | 247 |
| 21b | `admin/platform-updates-edit.js` | Platform updates: `editPlatformUpdate` | 206 |
| 21c | `admin/platform-updates-actions.js` | Platform updates: delete, cancel, reset, alert, `formatDateTimeLocal` | 198 |
| 22 | `admin/html-escape.js` | escapeHtml and escapeJs | 22 |
| 23 | `admin/platform-updates-init.js` | Platform updates DOMContentLoaded handler | 25 |
| 24 | `admin/ad-rules.js` | Ad rules | 242 |
| 25 | `admin/seo-pages.js` | SEO landing pages: section builder and casino picker | 403 |
| 26 | `admin/country-pages.js` | Country pages table and form | 237 |
| 27 | `admin/category-country-pages.js` | Category + country pages, and the last DOMContentLoaded handler | 255 |

## Cache and size

Every file is served with `?v=<hash>` and cached for a year; `scripts/asset-version.mjs` now also hashes the files in sub-folders, so a changed part gets a new URL. An admin page loads 26 more script files than before (small, parallel, cached after the first visit). Public pages are not affected: these scripts are inside the admin-only block.

## Next in the restructuring

`static/js/dashboard.js` (1,995 lines), `static/js/rich-editor.js` (1,927), then `worker/index.js` routing and `worker/site-settings.js`.

`header-hero-admin.js` is no longer a classic script: it is an ES module entry with parts in `header-hero-admin/` (see `ARCHITECTURE_HEADER_HERO_ADMIN.md`).

## Content edit actions (v22.58)

`admin/content-edit-actions.js` (515 lines) was a run of global functions, so it is four files that `base.html` loads one after the other, in this order, right after `research-datasets.js`:

| File | Lines | Functions |
|---|---:|---|
| `admin/content-edit-actions.js` | 139 | `deleteReview`, `deletePage`, `deleteNewsArticle`, `editReview`, `cancelReviewEdit` |
| `admin/content-edit-news.js` | 101 | `editNews`, `toDatetimeLocal`, `cancelNewsEdit` |
| `admin/content-edit-pages.js` | 157 | `editPage`, `cancelPageEdit` |
| `admin/content-edit-taxonomy.js` | 118 | `editCategory`, `cancelCategoryEdit`, `editCountry`, `cancelCountryEdit` |

The four files joined in order are byte-identical to the old file. The functions are only called from click handlers, so load order inside the group changes nothing, but the order is kept and tested (`test/admin-js-structure.test.js`).
