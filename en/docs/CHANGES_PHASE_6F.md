# Phase 6F (built on 6E)

Status: tested as part of the combined Phase 1-6 release; see `RELEASE_PHASE_1_6.md` for what was and was not verified.

## Page templates now work
- New `worker/page-templates.js`: the allow-list of layouts for ordinary pages (`page.html` Standard, `page-wide.html` Wide,
  `page-landing.html` Landing). `renderDynamicPage` now renders `resolvePageTemplate(page.template)`; any other stored value
  (old rows, typos, a path) renders the standard layout, so a stored value can never choose an arbitrary file.
- New templates `templates/pages/page-wide.html` and `page-landing.html`.
- The "Page layout and search listing" list on the Configuration screen has a "Page layout" choice. It is part of the draft,
  preview, publish, history and rollback like everything else. Unknown stored values show as Standard and are left alone
  unless that page's row is changed.

## Menu-link country rules are kept
- Menu links have a "Country rules" field (page menu only), written like `GB=allowed, DE=blocked`; statuses allowed, blocked,
  restricted. Stored in the version document, so deleting a link on publish and restoring it brings its rules back.
- Publish rewrites a link's rules when the link is new, put back, or its rules changed; deleting a link removes its rules.
- Draft preview applies the draft's rules with the same visibility logic as the live filter (`previewGeoFilter`).
- Rules can only be set on links in the page menu.

## Known limits
- Versions saved by 6D/6E have no country-rule data. Restoring one of those clears the rules of page-menu links.
- Tests for the row layer, page layouts, country rules and the screen section are in `test/site-profile-rows.test.js` and `test/site-profile-screen.test.js`.
