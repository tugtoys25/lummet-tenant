# Phase 6E (built on 6D)

Status: tested as part of the combined Phase 1-6 release; see `RELEASE_PHASE_1_6.md` for what was and was not verified.

## New: "8. Menus, SEO and components" on the Configuration screen
`static/js/admin/configuration-rows.js` (new), section `#rowsRoot` in `templates/pages/admin/configuration.html`, loaded from `base.html`.
- Tabs for each list the server reports as available: Menu links, Page search listing, SEO records, Components, Component placement.
- Every list is drawn from the server's description (labels, field types, limits), so a new field added in `rows.js` appears with no change here.
- Edits autosave to the draft after 0.8 s; each item shows "Changed in draft" / "New in draft", with "Undo my changes" or "Discard new item".
- Menu links and SEO records can be added and removed. Removed items are listed under "Removed in your draft" with "Put back".
- Find box, 20 items at a time. Read-only for roles that cannot edit the draft. Explains what to do when migration 0009 is missing or a list is too large.
- Errors from the server (for example an unsafe address) show next to the item.
- Review and publish, history, rollback and the activity log already include these changes (6D).

## Small changes
- `configuration-draft.js`: controller gains `sendRows`, `getState`, `api`.
- `rows.js` / `versions.js`: an item the draft removed can be put back from live (`applyRowsPatch(..., live)`).
- `test/admin-js-structure.test.js`: script order list now includes `configuration-rows`.
- Section numbers in the template: History is 9, Activity log is 10.

## Still open
- Page "template" is not offered: pages.template is stored but never used to choose a template.
- Menu-link deletes on publish do not keep page-menu country rules.
- No tests yet for the row layer or the screen.
