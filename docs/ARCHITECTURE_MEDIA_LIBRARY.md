# Architecture: the media library (`static/js/media-library.js` + `static/js/media-library/`)

Since v22.25 the media library UI (1,036 lines, one closure) is an entry module, `static/js/media-library.js` (header comment and `window.MediaLibrary = { init, loadMedia, loadFolders }`), and 6 ES modules in `static/js/media-library/`. The public API is unchanged: `MediaLibrary.init(containerId)`.

Same technique and same reasons as the rich editor (`docs/ARCHITECTURE_RICH_EDITOR.md`): names stay private, parts are imported by absolute path, and the import map in `templates/layout/base.html` (one map for both editors, before the first module script) lets the worker add `?v=<hash>`. The media page loads the entry as a module too (`<script type="module">`; the same URL as in `base.html`, so it runs once).

## Parts

| File | Holds | Lines |
|---|---|---:|
| `media-library/config.js` | Endpoints, page size, accepted types and the shared `state` object | 37 |
| `media-library/utils.js` | Helpers: `escapeHtml`, `formatFileSize`, `formatDate`, `showToast`, `getCsrfToken`, `isDarkMode`, `getTypeIcon`, `debounce` | 76 |
| `media-library/actions.js` | API calls and the actions behind the buttons: load folders and media, upload, delete, update metadata, create/rename/delete folder | 214 |
| `media-library/views.js` | Rendering: the main layout, folder sidebar, grid, previews, pagination | 319 |
| `media-library/modals.js` | Edit modal, folder menu, new-folder modal, `closeModal`, `copyToClipboard` | 243 |
| `media-library/events.js` | `attachEventListeners` and `init` | 123 |

Imports:

- `config` imports from: nothing
- `utils` imports from: nothing
- `actions` imports from: `config`, `utils`, `views`
- `views` imports from: `config`, `utils`, `actions`, `modals`, `events`
- `modals` imports from: `config`, `utils`, `actions`
- `events` imports from: `config`, `utils`, `actions`, `views`, `modals`

`actions`, `views`, `modals` and `events` call each other (a render function wires events, a button handler reloads and re-renders), so they import each other in a loop. That is fine for ES modules because every call happens after loading; `config` and `utils` import nothing from them. A new part: create the file, add it to the import map in `base.html`, run `node scripts/asset-version.mjs`.
