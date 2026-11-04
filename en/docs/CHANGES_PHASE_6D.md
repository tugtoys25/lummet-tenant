# Phase 6D (built on 6C)

Status: tested as part of the combined Phase 1-6 release; see `RELEASE_PHASE_1_6.md` for what was and was not verified.

## What is in
Five kinds of row data now travel inside the configuration document (`rows`), with the same draft, three-way merge,
publish, numbered versions, rollback and audit as the profile and settings:
- `nav` menu links you added (auto-generated category/country links are excluded)
- `pages` search title / description / keywords of standard pages
- `seo` per-address SEO records (seo_meta)
- `components` name, title, status, settings (content stays in the Component Studio)
- `placements` component on/off, order, position

Files: new `worker/site-profile/rows.js`, new `worker/component-settings-clean.js` (shared with the component API),
changes in `site-profile/versions.js`, `api/routes/site-profile-versions.js`, `api/routes/index.js`,
`api/routes/components.js`.

API: `PUT /api/v1/config/draft` accepts `rows: { nav: { set: { key: {field: value} }, remove: [key] } }`;
`GET /api/v1/config/rows/<set>` returns the draft's (or live) rows and which keys changed; `/state` lists the sets.
New menu links use a key like `new-abc123` and get real ids at publish. Publish re-validates every changed row (422 on failure).

Preview: a signed-in editor previewing the draft sees draft menu links, page/SEO listings and component settings/placements
(navigation.js, categories/countries sub-nav, component-engine.js, render/components.js, dynamic-pages.js, affiliates.js).

History: saves through the older nav, SEO, page-update and component endpoints are now recorded as versions ("direct").

Limits: a set with more rows than its cap (nav 300, seo 400, pages 400, components 200, placements 600) or over 150 KB is not
versioned and is reported as skipped. Document size limit is now 700 KB. Rollback to a pre-6D version leaves rows untouched.
Deleting a menu link on publish does not preserve its page-menu country rules.

## Not done
- No Configuration screen for these lists yet (the API is ready; the dashboard JS/HTML is unchanged).
- Page "template" is not included: pages.template is stored but never used to choose a template (page.html is always rendered),
  so a switch would do nothing.
- Existing tests that assert the document shape or version number (`v: 1`) may need updating; not checked.
- No new migration.
