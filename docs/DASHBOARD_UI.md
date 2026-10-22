# Dashboard shell (tenant admin and user dashboards)

Both dashboards share one navigation shell. Nothing here changes what a user may do:
routes, permissions and APIs are untouched.

| File | Role |
|---|---|
| `en/templates/layout/admin-nav.html` | admin navigation: menu bar, drawer, 8 groups, page filter |
| `en/templates/layout/user-nav.html` | user navigation (new): one shared copy for the 6 user pages |
| `en/static/css/dashboard-shell.css` | all shell styles, scoped to `.admin-wrapper` / `.dash-*` |
| `en/static/js/dashboard-shell.js` | toggle, drawer, groups, active page, page filter |

## Behaviour

- A **Menu** button replaces the old horizontally scrolling bar.
  Above 900px it collapses or restores the docked sidebar (remembered per browser).
  At 900px and below the sidebar is an off-canvas drawer; the backdrop, the close button,
  Escape, or choosing a link closes it.
- Links are **grouped** (admin: Casinos & Reviews, Content Engine, Publishing, Site Structure,
  Partners & Tracking, Insights, Audience, Administration; user: Account, My Activity, Contribute).
  Groups are `<details>`, so they work without JavaScript. The group with the current page opens.
- The **current page** is found from the URL, including create/edit pages
  (for example `/en/dashboard/casino/edit/x` highlights Casinos). The top bar shows `Group / Page`.
- **Permissions:** `admin-permissions.js` still hides links a role may not use. The shell watches for
  that and hides any group left with no visible link.
- The dashboard uses the **full browser width** and the tenant brand colors
  (`--primary`, `--surface-dark`, ...), so each tenant keeps its own look.
- On dashboard pages the public bottom tab bar is hidden at 900px and below, because it would be a
  second navigation next to the drawer.

## Adding a page to the admin menu

Add one `<a href="...">` to the right group in `admin-nav.html`. Active-page detection and the filter
pick it up automatically. Update the link inventory in `en/test/dashboard-shell.test.js`.

## Notes

- `en/static/sw.js` caches `dashboard.css` and a few other files; the new stylesheet and script are new
  URLs, so returning visitors fetch them normally.
- Layout was verified in a real browser at 390px and 1280px; the automated tests check markup,
  wiring and script safety, not appearance.

## Customer (user) pages

The six customer pages (`en/templates/pages/users/`) use the same page components as the admin, defined in the
"PAGE COMPONENTS" block of `dashboard-shell.css`: `admin-header dash-page-head` (title, subtitle, actions),
`stat-card` (as links), `admin-section`, `dash-tabs` (filters with counts), `dash-item` record cards,
`status-badge` (`status-published|pending|rejected|new`), `admin-form dash-form`, and `dash-empty-state` /
`dash-error-state` / `dash-skel` for empty, error and loading. Use these on any new page, admin or user.

- `user-dashboard.js` escapes every API value, only links to internal paths or http(s), shows rich-editor
  notification text as plain text, uses event delegation (no inline handlers, nothing on `window`), and puts an
  unread-count chip on the sidebar's Notifications link.
- Overview adds Recent Notifications and Recent Inquiries; Inquiries, Notifications and Submissions have filter tabs.
- Server: `email`/`role` are HTML-escaped before templating, profile email is validated (duplicate -> 409), and
  marking a notification read is limited to its owner.
- Tests: `en/test/user-dashboard.test.js`.
