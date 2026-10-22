# Release: settings contents bar no longer floats over the footer (tenant v17.2)

Built on tenant v17.1. Control plane untouched.

## The problem

On Dashboard > Settings, the bar of section links (General, Analytics, GPWA Verification, ...) is pinned to the top of the screen. It stayed there while scrolling into the site footer, covering the disclaimer and footer links, until you left the page.

## The fix

`en/templates/pages/admin/settings.html`: the bar still floats while the settings are on screen. When the end of the settings has scrolled up past it (the footer is showing) it steps aside, and it comes back when you scroll up. If the page is replaced without a full reload, the bar is removed. Checked in a real browser at 390 and 1280 wide: visible at top, visible near the end of the settings, hidden on the footer, visible again scrolling up.

## Numbers

Counted with `git diff --numstat` against v17.1, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **2** | **22** | **0** |

Tests: 960 pass; 1 new. Migrations: **none**. Deleted files: **none**.

## Modified files (2)

| File | + | - |
|---|---:|---:|
| `en/templates/pages/admin/settings.html` | 13 | 0 |
| `en/test/component-studio.test.js` | 9 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v17-2-settings-nav.patch
git apply ~/storage/downloads/lummet-tenant-v17-2-settings-nav.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v17-2-settings-nav-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v17-2-settings-nav-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v17-2-settings-nav-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/component-studio.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant: settings contents bar steps aside at the footer"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 40`. Hard-refresh the page afterwards.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
