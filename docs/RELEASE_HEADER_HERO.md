# Release: Header & Hero manager (tenant v8)

Built on the version you have now (`sunday5`). Control plane untouched.

## What changed for users

- New admin page **Site Structure → Header & Hero** with a live desktop/phone preview, quick styles,
  validation and a sticky save bar. See `docs/HEADER_HERO.md`.
- Announcement bar, header (style, height, logo, search, buttons, CTA) and homepage hero are now all editable.
- The old header placeholders "LO"/"DB" are now real, editable labels (default Logout / Dashboard).
- The hero form moved out of Settings (a pointer card remains). The same setting keys are used, so existing values carry over.
- Fixes: the old hero template always emitted an empty `background-image:url('')`.
- Defaults reproduce the previous look; a browser check compared header and hero geometry with the original.

## Numbers

Counted with `git diff --numstat` against your current version, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **20** | **1657** | **224** |
| New files | 7 | 1587 | 0 |
| Modified files | 13 | 70 | 224 |
| Deleted files | 0 | 0 | 0 |

Tests: 830 pass serially (`npm test -- --test-concurrency=1`), including 43 new in `en/test/header-hero.test.js`.

## Migrations

**None.** No new secret or binding. Nothing to run in D1.

## Deleted files

None. Lines removed are the old hero block in `home.html`, the old header markup, and the hero form in `settings.html`; all are replaced.

## New files (7)

| File | + | - |
|---|---:|---:|
| `docs/HEADER_HERO.md` | 29 | 0 |
| `en/static/css/header-hero.css` | 251 | 0 |
| `en/static/js/header-hero-admin.js` | 469 | 0 |
| `en/static/js/header-hero.js` | 36 | 0 |
| `en/templates/pages/admin/header-hero.html` | 45 | 0 |
| `en/test/header-hero.test.js` | 385 | 0 |
| `en/worker/header-hero.js` | 372 | 0 |

## Modified files (13)

| File | + | - |
|---|---:|---:|
| `en/static/js/admin.js` | 15 | 8 |
| `en/templates/layout/admin-nav.html` | 1 | 0 |
| `en/templates/layout/base.html` | 6 | 1 |
| `en/templates/layout/header.html` | 15 | 13 |
| `en/templates/pages/admin/settings.html` | 8 | 131 |
| `en/templates/pages/home.html` | 1 | 68 |
| `en/test/dashboard-shell.test.js` | 4 | 2 |
| `en/worker/api.js` | 2 | 1 |
| `en/worker/controllers.js` | 6 | 0 |
| `en/worker/index.js` | 3 | 0 |
| `en/worker/render.js` | 4 | 0 |
| `en/worker/routes.js` | 1 | 0 |
| `en/worker/site-settings.js` | 4 | 0 |

## Install on the phone (Termux), pick ONE

### A. Script
```bash
cd ~/lummet/lummet-tenant && git status --short
unzip -p ~/storage/downloads/lummet-tenant-v8-header-hero-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh
bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v8-header-hero-full.zip ~/lummet/lummet-tenant
bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v8-header-hero-full.zip ~/lummet/lummet-tenant
```
### B. Patch
```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v8-header-hero.patch
git apply ~/storage/downloads/lummet-tenant-v8-header-hero.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
npm test -- --test-concurrency=1 2>&1 | tail -12
cd ..
git add -A && git status --short && git diff --cached --stat | tail -1
git commit -m "Tenant: Header & Hero manager"
git push origin main
cd en && npx wrangler deploy
```

Then open `/en/dashboard/header-hero`, change the hero title, check the preview, Save, and reload the homepage.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy
```
Saved values stay in `settings` and are ignored by the old code.
