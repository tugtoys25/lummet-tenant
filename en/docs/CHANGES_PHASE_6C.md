# Phase 6C

## Security fix (important)
The role named `viewer` is what every visitor who registers on the public site receives. Phase 6A/6B let it read
`/api/v1/config/*` (state, versions, audit log with staff emails, draft). It now gets nothing. Configuration access is staff only:

| Role | Open Configuration | Read history/activity | Edit draft + preview | Publish / roll back / discard |
| --- | --- | --- | --- | --- |
| viewer (public account) | no | no | no | no |
| editor | yes | yes | yes | no |
| admin | yes | yes | yes | yes |

## Changes
- `site-profile/versions.js`: `permissionsFor` is staff only.
- `api/routes/site-profile.js`: GET and the read-only "what will change" preview are open to editors; all live writes stay admin-only with a message pointing editors to the draft.
- `controllers/dashboard.js`: the Configuration page opens for editors.
- `api/routes/settings.js` (legacy Settings and Header & Hero save): an administrator's save of look-and-feel keys is now recorded as a version (6A said this already happened; it only did for the site-profile endpoints). Editors can no longer change look-and-feel keys live through this endpoint; they get a message to use the draft. Other settings are unchanged.

## Not done in 6C
Navigation items, templates, component settings and per-page SEO are row data, not settings keys, and are still not part of the draft/version document. No browser check of the screen. Tests were not run for this package; five existing assertions were edited for the new role rules without being run.
