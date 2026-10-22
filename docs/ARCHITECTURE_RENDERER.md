# Architecture: the template renderer (`worker/render.js` + `worker/render/`)

Since v22.27 `worker/render.js` (908 lines) keeps the `Renderer` class core and the same exports (`Renderer`, `needsAdminAssets`, `selectAssetSet`, `expandIncludes`); the rest of the class moved to mixin files in `worker/render/`. Every controller still does `import { Renderer } from "../render.js"`.

## Where things are

| File | Holds |
|---|---|
| `render.js` | `Renderer`: constructor, `getSiteContext`, `loadTemplate`, `render` (the page pipeline); installs the mixins |
| `render/variables.js` | `CONTENT_FIELDS`; `replaceVariables`, `replaceVariablesbackups` |
| `render/components.js` | `injectComponents`, `renderComponents`, `renderAllComponents`, `renderReviewBlocks`, `loadDynamicSeo` |
| `render/navigation.js` | `loadNavData`, `loadPageNav`, `isPartialRequest`, `getNormalizedPath`, `isPageNavItemActive`, `buildPageNavHtml`, `buildMobileNav`, `buildHeaderNav`, `buildFooterLinks`, `loadActiveBanners` (+ the old backup) |
| `render/seo.js` | `escapeHtml`, `buildSEO`, `buildSchemas` |
| `render/assets.js` | `needsAdminAssets`, `selectAssetSet`, `expandIncludes` (template includes, see `ARCHITECTURE_TEMPLATE_INCLUDES.md`) |
| `render/install-methods.js` | `installMethods(Renderer, ...mixins)` |

## How a method is split off

A mixin file exports an object of methods written exactly as in a class body (`async loadNavData() { ... }`, using `this`). `installMethods` defines each one on `Renderer.prototype` as a class would: not enumerable, writable, configurable. A method name defined twice throws at load. So `new Renderer(...).loadNavData()` works the same, and `Renderer.prototype.x = ...` patches in tests still work.

To add a method: put it in the mixin where it belongs (or in `render.js` if it is part of the page pipeline). Lazy `import()` paths in a mixin are relative to `worker/render/` (so `../cache.js`); a test checks that they resolve.

## Next

Nothing else in the tenant worker is above 900 lines except the stylesheets.
