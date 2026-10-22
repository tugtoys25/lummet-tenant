# Release: pictures show in the Media picker (tenant v17.1)

Built on tenant v17. Control plane untouched.

## The problem

In the Media picker (the "Select Image" dialog) every tile showed a broken picture with only the file name. The dialog asks for a resized thumbnail (`/cdn-cgi/image/width=400,...`). That resizing service is not available on this site, so the thumbnails never load. The Media library page already falls back to the original picture when the thumbnail fails; the picker did not.

## The fix

`en/static/js/media-picker.js`: when a thumbnail fails to load, the tile shows the original picture instead (same behaviour as the Media library page). Nothing else changes, and nothing is stored differently. Checked in a real browser with a thumbnail address that returns 404: the original loads.

This affects every place the picker opens: all "Choose from Media" buttons, featured images, hero pictures, logos.

## Numbers

Counted with `git diff --numstat` against v17, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **2** | **20** | **1** |

Tests: 959 pass; 1 new. Migrations: **none**. Deleted files: **none**.

## Modified files (2)

| File | + | - |
|---|---:|---:|
| `en/static/js/media-picker.js` | 12 | 1 |
| `en/test/component-studio.test.js` | 8 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v17-1-media-thumbs.patch
git apply ~/storage/downloads/lummet-tenant-v17-1-media-thumbs.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v17-1-media-thumbs-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v17-1-media-thumbs-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v17-1-media-thumbs-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/component-studio.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant: media picker shows the original picture when a thumbnail fails"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 39`. Hard-refresh the dashboard afterwards.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
