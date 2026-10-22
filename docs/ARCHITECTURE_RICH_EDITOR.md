# Architecture: the rich text editor (`static/js/rich-editor.js` + `static/js/rich-editor/`)

Since v22.18 the rich text editor (TinyMCE wrapper) is no longer one 1,927-line closure. It is an entry module, `static/js/rich-editor.js` (header comment, form hook, bootstrap, `window.RichEditor = RichEditor`), and 12 ES modules in `static/js/rich-editor/`. The public API is unchanged: `RichEditor.get/set/insertImage/destroy/...` and `<textarea data-rich-editor>`.

## Why modules and not plain scripts

The old file was one `(function () { ... })()` with about 60 private functions. As plain scripts those names would become globals and could collide with the other admin scripts (for example `showToast`, `escapeText`). Modules keep every name private, and each file lists what it takes from the others.

## Loading and cache versions

`templates/layout/base.html` (admin-only block) has an import map and then `<script type="module" src="/static/js/rich-editor.js">`. Parts are imported by absolute path, for example `import { getCsrfToken } from "/static/js/rich-editor/utils.js"`. The import map maps each of those paths to itself, and `versionAssetUrls` (`worker/static-assets.js`) adds `?v=<hash>` to the map values, the same hash as every other asset. So a release never mixes old and new parts, and the one-year cache stays safe.

**A new part:** create the file, add it to the import map in `base.html`, then run `node scripts/asset-version.mjs`. A test checks that the map lists exactly the files in the folder.

## Parts

| File | Holds | Lines |
|---|---|---:|
| `rich-editor/config.js` | Constants: CDN URL, API endpoints, size limit, allowed image types and video sources | 28 |
| `rich-editor/utils.js` | `getCsrfToken`, `isDarkMode`, `generateEditorId`, `showToast`, `escapeEditorHtml` | 99 |
| `rich-editor/autosave.js` | Autosave to localStorage (`autosave`, `getAutosave`, `clearAutosave`) | 51 |
| `rich-editor/image-upload.js` | `uploadImage`, `getImageDimensions`, `validateImageFile` | 92 |
| `rich-editor/editor-config.js` | TinyMCE toolbar, menu and plugin lists, the source-code button | 125 |
| `rich-editor/image-dialog.js` | Image upload hook, the image dialog, `insertImageIntoEditor` | 111 |
| `rich-editor/video.js` | Video embed button, dialog, `buildVideoEmbed`, `isAllowedVideoSource` | 167 |
| `rich-editor/ad-inserter.js` | Ad inserter button, dialog, marker/placeholder conversion | 298 |
| `rich-editor/callout.js` | Callout box button and dialog | 169 |
| `rich-editor/internal-link.js` | Content pickers, internal link dialog and search | 250 |
| `rich-editor/tinymce-init.js` | `initEditor`, `getContentStyle`, `loadTinyMCE`, `autoInit`, and the loader state (`tinymceLoaded`, `tinymceLoading`, `pendingEditors`, `editorRegistry`) | 292 |
| `rich-editor/api.js` | The `RichEditor` object (`get`, `set`, `insertImage`, `destroy`, ...) | 157 |

Imports (no part imports the entry, so there is no loop through it):

- `config` imports from: nothing
- `utils` imports from: nothing
- `autosave` imports from: nothing
- `image-upload` imports from: `config`, `utils`
- `editor-config` imports from: nothing
- `image-dialog` imports from: `config`, `utils`, `image-upload`
- `video` imports from: `config`, `utils`
- `ad-inserter` imports from: `utils`
- `callout` imports from: `utils`
- `internal-link` imports from: `utils`
- `tinymce-init` imports from: `config`, `utils`, `autosave`, `editor-config`, `image-dialog`, `video`, `ad-inserter`, `callout`, `internal-link`
- `api` imports from: `tinymce-init`, `autosave`, `image-dialog`

`tinymce-init` and the loader state: `loadTinyMCE` is the only code that assigns `tinymceLoaded`, `tinymceLoading` and `pendingEditors`, so they live in the same file (an imported name cannot be reassigned). Other parts read them as live bindings.

## Next in the restructuring

`worker/index.js` routing, `worker/site-settings.js` and the large admin template `templates/pages/admin/settings.html`.
