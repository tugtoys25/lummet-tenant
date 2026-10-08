# Release: redesigned dashboards (tenant admin and user dashboards)

Applies to the `lummet-tenant` repo (the `en/` folder), checked against the tenant files in `saturday4version.zip`. The control plane is a separate release.

## What changed for users

- **Menu button instead of a link bar.** Navigation is grouped into collapsible sections.
  On a desktop the sidebar is docked and the **Menu** button collapses or restores it (remembered);
  on a phone or tablet (900px and narrower) the same button opens a slide-out drawer that closes from
  the backdrop, the close button, the Escape key, or by choosing a link.
- **Find a page** box filters the menu across all groups.
- **Current page** is highlighted and its group opened, including create and edit pages.
- **Nothing was removed or moved to a new URL.** Every previous link is still there (a test compares the
  new menu with the old list of links). Permissions, routes and APIs are untouched; hiding a link stays a
  convenience, the server checks remain the real boundary.

See `docs/DASHBOARD_UI.md` for how the shell works and how to add a page to the menu.

## Numbers

Counted with `git diff --numstat` against the version you have now, excluding the three generated files
(`docs/RELEASE_DASHBOARDS.md`, `docs/integration/baseline.sha256`, `docs/integration/removed.txt`).

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **16** | **903** | **111** |
| New files | 6 | 771 | 0 |
| Modified (touched) files | 10 | 132 | 111 |
| Deleted files | 0 | 0 | 0 |

**Tests: 787 passing** (773 before, plus 14 new ones: link inventory, grouping, wiring of all 61 admin pages and 6 user pages, and script safety rules).

## Migrations

**None.** No database change, no new secret, no new setting. Nothing to run in the D1 console.

## New files (6)

| File | + | - |
|---|---:|---:|
| `docs/DASHBOARD_UI.md` | 41 | 0 |
| `docs/integration/integrate.sh` | 81 | 0 |
| `en/static/css/dashboard-shell.css` | 261 | 0 |
| `en/static/js/dashboard-shell.js` | 199 | 0 |
| `en/templates/layout/user-nav.html` | 41 | 0 |
| `en/test/dashboard-shell.test.js` | 148 | 0 |

## Modified files (10)

| File | + | - |
|---|---:|---:|
| `README.md` | 4 | 0 |
| `en/templates/layout/admin-nav.html` | 113 | 55 |
| `en/templates/layout/base.html` | 2 | 0 |
| `en/templates/pages/users/bookmarks.html` | 1 | 9 |
| `en/templates/pages/users/dashboard.html` | 1 | 9 |
| `en/templates/pages/users/inquiries.html` | 1 | 9 |
| `en/templates/pages/users/notifications.html` | 1 | 9 |
| `en/templates/pages/users/profile.html` | 1 | 9 |
| `en/templates/pages/users/submit-casino.html` | 1 | 9 |
| `en/worker/controllers.js` | 7 | 2 |

## Deleted files

None.

## Install on the phone (Termux)

Pick ONE of the two ways, not both.

### A. Script (checks first, refuses to overwrite your own edits)

```bash
cd ~/lummet/lummet-tenant && git status --short            # must print nothing
unzip -p ~/storage/downloads/lummet-tenant-v4-dashboards-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh
bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v4-dashboards-full.zip ~/lummet/lummet-tenant
bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v4-dashboards-full.zip ~/lummet/lummet-tenant
```

`check` changes nothing: it unpacks into `~/lummet/compare-upgrades/`, verifies that the files this change
modifies are still the versions it was built on, and lists every difference. `apply` copies the files.

### B. Patch

```bash
cd ~/lummet/lummet-tenant && git status --short            # must print nothing
git apply --check ~/storage/downloads/lummet-tenant-v4-dashboards.patch
git apply ~/storage/downloads/lummet-tenant-v4-dashboards.patch
```

## Test, then commit

```bash
cd ~/lummet/lummet-tenant/en && npm test 2>&1 | grep -E "^# (tests|pass|fail)"
```
Expected: `# tests 787`, `# pass 787`, `# fail 0` (about a minute).

```bash
cd ~/lummet/lummet-tenant
git add -A
git status --short
git diff --cached --stat | tail -1
git commit -m "Dashboard shell: grouped navigation, menu toggle, responsive layout"
git push origin main
```

## Deploy

Deploy the tenant the way you normally do. The new files live under `en/` (templates, one stylesheet, one script) and are served as assets, so the deploy must include them. If you deploy by command: `cd ~/lummet/lummet-tenant && npx wrangler deploy`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://YOUR-TENANT-DOMAIN/static/css/dashboard-shell.css     # expect 200
curl -s -o /dev/null -w "%{http_code}\n" https://YOUR-TENANT-DOMAIN/static/js/dashboard-shell.js       # expect 200
```

Then open `/en/dashboard` (admin) and `/en/user/dashboard` (user) and check the Menu button, the groups, and a table page at phone width.

On dashboard pages the public bottom tab bar is hidden at 900px and below, because it would be a second navigation next to the drawer.

## Rollback

```bash
cd ~/lummet/lummet-tenant
git revert --no-edit HEAD
git push origin main
```

There is no migration to undo.
