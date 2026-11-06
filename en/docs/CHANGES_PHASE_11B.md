# Phase 11B: one switch per custom content type (T2)

## What changed
- New capability ids `content.custom.<slug>` (lowercase slug, no dots). Stored sparsely in `profile.pages`
  like the other page switches: only "off" is stored. A new custom type is ON by default.
- A type is live only while its parent `content.custom` and the content module are live.
- Public list, detail and review URLs of an off type follow the removed-page mode (404 / 410 / 301). This goes through
  the existing gate, so the sitemap file entries, header/footer/mobile navigation, body links and the research search
  results drop those URLs by the same rule as every other removed page.
- The public search API (`/api/v1/public/search`) now filters its results through the same rule. This also fixes
  results for removed sections (news, casinos and so on), which that endpoint did not filter before.
- Configuration screen: the custom types are listed under "Custom content types" with one checkbox each, and the
  "what will change" preview names the ones switched off.
- `GET /api/v1/site-profile` returns `customTypes`. `POST` drops choices for types that no longer exist (a read
  failure keeps them). Export and import carry the choices inside the profile; an import into a site that lacks the
  type stores a harmless unused entry.
- `worker/asset-version.js` regenerated because `configuration.js` changed.

## Not done on purpose
- Dashboard editors and the content-items API are generic across all content types. They are not hidden per custom
  type, so an editor can still edit items of a switched-off type. Hiding them needs an item-level filter and is a
  separate decision.
- Comparison pages for a custom type: no route that carries a custom type slug was found, so nothing was added.
- Saving a draft (not the direct API save) does not check the slug against the live types; unknown ids are simply unused.

## NOT VERIFIED
Ran only the test files touched or adjacent: site-profile-custom-types (15 tests, new), content-types-profile-sync,
site-profile, -manifest, -links, -screen, -guidance, -versions, -settings, -transfer-plan, -transfer-api, site-setup,
api-structure, config-a11y-dom, config-performance-budget, perf-assets, preset-ids-pinned, preview-system-off,
site-upgrades and a few item-access files. The full suite, a browser check of the new checkboxes, keyboard and screen
reader use, real D1, and the control plane were not run. Custom type slugs outside `[a-z0-9_-]` cannot be switched
individually (they stay governed by the parent switch).
