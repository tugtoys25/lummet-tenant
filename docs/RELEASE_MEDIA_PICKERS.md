# Release: "Choose from Media" on every picture-address field (tenant v17)

Built on tenant v16.1. Control plane untouched.

## What changed

Every dashboard field that still needed a picture address typed or pasted now has a **Choose from Media** button (searches the Media library), a small preview, and **Remove**. Typing an address by hand still works.

| Where | Field |
|---|---|
| Authors | Avatar URL |
| Casinos (create and edit) | Logo URL |
| SEO | OG image |
| Settings | Site logo, social share (OG) image, favicon 96, favicon SVG, favicon ICO, Apple touch icon, PWA icon 192 and 512 |
| Settings > footer compliance | Each compliance icon / logo |
| Settings > Homepage Content | Each section's background picture; each card's picture and background picture |
| Research sections | Image section's picture |

Rows that the dashboard builds later (compliance rows, homepage cards, research sections) are covered too: the picker watches for new rows. `.ico` files get no thumbnail (browsers cannot show them in a preview) and the web manifest is not a picture, so it has no button.

Already visual before this release and unchanged: payment method icon, updates and news featured images, content item logo and featured image, country/category share images, the hero and header editors, and Component Studio pictures.

Not changed on purpose: the Media library page itself (its "add by address" form), and emoji icon fields (custom type icon, navigation icon).

## Numbers

Counted with `git diff --numstat` against v16.1, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **2** | **86** | **3** |

Tests: 958 pass serially; 8 new in `en/test/component-studio.test.js`. Checked in a real browser at phone width on the Authors, Settings and Casino pages (button count, pick fills the field, thumbnail shows, rows added later are enhanced).

Migrations: **none**. Deleted files: **none**.

## Modified files (2)

| File | + | - |
|---|---:|---:|
| `en/static/js/link-picker.js` | 51 | 3 |
| `en/test/component-studio.test.js` | 35 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v17-media-pickers.patch
git apply ~/storage/downloads/lummet-tenant-v17-media-pickers.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v17-media-pickers-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v17-media-pickers-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v17-media-pickers-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/component-studio.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant: Choose from Media on every picture address field"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 38`. After deploying, hard-refresh the dashboard (the old script may be cached).

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
