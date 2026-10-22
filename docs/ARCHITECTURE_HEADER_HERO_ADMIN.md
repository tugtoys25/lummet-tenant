# Header & Hero admin script (static/js/header-hero-admin*)

The dashboard page *Header & Hero* used one 811-line IIFE. It is now an ES-module entry plus six parts. All parts import each other with absolute paths listed in the import map in `templates/layout/base.html` (inside the admin-only block), so the worker versions every part with `?v=<hash>`.

| File | Lines | Holds |
|---|---:|---|
| `header-hero-admin.js` | 76 | Entry: events on the form, device radios, save/discard/reset buttons, `beforeunload`, `resize`, first `updateCounts()` and `load()`. Wrapped in `if (form)`. |
| `header-hero-admin/state.js` | 17 | The form and button elements, `DEFAULTS`, `KEYS`. |
| `header-hero-admin/fields.js` | 47 | `repeaters`, `inputsFor`, `getValue`, `setValue`, `snapshot`, `applyAll`. |
| `header-hero-admin/validate.js` | 127 | Fonts, link and colour checks, contrast, `validate`, `updateCounts`, `parseVideo`. |
| `header-hero-admin/repeater.js` | 196 | `initRepeater` (slides and cards rows); builds the repeaters when evaluated. |
| `header-hero-admin/preview.js` | 277 | Preview frame, `renderPreview`, `fitPreview`, `setMobilePreview`. |
| `header-hero-admin/actions.js` | 127 | `saved`, `loaded`, status, dirty tracking, presets, `load`, `save`. |

## The three deliberate code changes

1. A module has no top-level `return`, so `if (!form) return;` became `if (form) { ... }` in the entry, and `repeater.js` only builds the repeaters `if (form)`. The script is loaded on every admin page; the other parts only declare functions and read elements inside a `try`, so they do nothing without the form.
2. `mobilePreview` is assigned from the entry, and imported bindings are read-only, so `setMobilePreview(value)` (in `preview.js`) is the one writer.
3. `"use strict"` is gone: modules are always strict.

The entry imports `repeater.js` for its side effect (nothing imports it otherwise). Parts import each other in a cycle (for example `preview` and `actions`); that is safe because they only declare functions and the first statements run from the entry after every part is evaluated.
