# Architecture: the dashboard script (`static/js/dashboard/`)

Since v22.17 the old `static/js/dashboard.js` (1,995 lines) is 13 files in `en/static/js/dashboard/`. They are plain classic scripts, loaded one after another by `templates/layout/base.html` in the admin-only block, exactly where `dashboard.js` was (just before the `admin/` scripts). The files, joined in the order below, are byte-for-byte the old file.

The same rules as for the admin script apply (`docs/ARCHITECTURE_ADMIN_JS.md`): one shared global scope, inline `onclick` handlers call the functions by name, and the order of the `<script>` lines in `base.html` is the order the code ran in (a test checks it). A new file goes into `static/js/dashboard/` and into that list; no `import`/`export`.

## Files, in load order

| # | File | Holds | Lines |
|---|---|---|---:|
| 1 | `dashboard/init.js` | First DOMContentLoaded handler: starts the generic review, landing page and other forms | 28 |
| 2 | `dashboard/generic-review-edit.js` | Generic review edit form | 103 |
| 3 | `dashboard/content-landing-pages.js` | Content landing pages: table, delete, mode toggle, create and edit forms | 197 |
| 4 | `dashboard/list-pager.js` | List search parameter, the admin-list-search listener, pager controls and page state | 38 |
| 5 | `dashboard/stats.js` | Dashboard statistics: totals, top casinos, top countries | 77 |
| 6 | `dashboard/casinos.js` | Casinos table, delete, casino form | 180 |
| 7 | `dashboard/content-items.js` | Content items table, search listeners, publish toggle, content item form | 279 |
| 8 | `dashboard/content-item-form-parts.js` | Parts of the content item form: relationship and category checkboxes, geo rule editor, media picker | 148 |
| 9 | `dashboard/custom-types.js` | Custom content types table and form | 104 |
| 10 | `dashboard/comparisons.js` | Comparisons: table, item picker, editorial pick picker, criterion rows, comparison form | 350 |
| 11 | `dashboard/edit-forms.js` | Edit forms for content items, custom types and comparisons | 322 |
| 12 | `dashboard/content-type-settings.js` | Content type settings form | 47 |
| 13 | `dashboard/generic-reviews.js` | Generic reviews table, delete, publish toggle, review form | 135 |

## Next in the restructuring

`static/js/rich-editor.js` (1,927 lines), then `worker/index.js` routing, `worker/site-settings.js` and the large admin template `templates/pages/admin/settings.html`.
