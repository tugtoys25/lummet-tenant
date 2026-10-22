# Architecture: site settings (`worker/site-settings.js` + `worker/site-settings/`)

Since v22.19 `worker/site-settings.js` (1,771 lines) is a facade that re-exports the public API from 9 modules in `worker/site-settings/`. Every importer (`render.js`, `site-context.js`, `index.js`, tests) keeps using `./site-settings.js`; nothing else changed.

Public API (unchanged): `getSiteSettings`, `buildSiteManifest`, `buildHomepageSectionsHtml`, `buildGaScript`, `buildGpwaSeal`, `buildGpwaScript`, `buildComplianceHtml`, `buildThemeCss`.

## Parts

| File | Holds | Lines |
|---|---|---:|
| `site-settings/defaults.js` | `DEFAULTS`, the default value of every site setting | 201 |
| `site-settings/manifest.js` | `resolveUrl` and `buildSiteManifest` (web manifest) | 88 |
| `site-settings/helpers.js` | `escapeHtml`, `parseJson`, `parseHomepageSections` | 47 |
| `site-settings/get-site-settings.js` | `getSiteSettings`: reads the settings table, applies defaults, caches | 348 |
| `site-settings/homepage-cards.js` | Homepage card rendering: icons, links, `renderHomepageCard` | 163 |
| `site-settings/homepage-sections.js` | `renderHomepageSection` for every section type, and `buildHomepageSectionsHtml` | 353 |
| `site-settings/analytics.js` | Google Analytics and GPWA snippets (`buildGaScript`, `buildGpwaSeal`, `buildGpwaScript`) | 72 |
| `site-settings/compliance.js` | `buildComplianceHtml` (footer compliance block) | 44 |
| `site-settings/theme.js` | `buildThemeCss`: tenant CSS variables, with the colour and CSS value sanitizers | 441 |

Imports between parts (no cycles; a test checks it):

- `defaults` imports from: no other part
- `manifest` imports from: no other part
- `helpers` imports from: `defaults`
- `get-site-settings` imports from: `defaults`, `manifest`, `helpers`
- `homepage-cards` imports from: `helpers`
- `homepage-sections` imports from: `helpers`, `homepage-cards`
- `analytics` imports from: `helpers`
- `compliance` imports from: `helpers`
- `theme` imports from: no other part

## Rules

- A new public function goes into the fitting part and is re-exported by name in `worker/site-settings.js`. Anything not re-exported is private to the parts.
- Keep parts under 500 lines (a test checks it).
