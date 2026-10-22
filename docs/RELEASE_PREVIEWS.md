# Release: previews for the older component types (tenant v15.1)

Built on tenant v15 (commit `cb409b3`). Control plane untouched.

## What changed

In Dashboard > Components, Text, CTA, Banner, FAQ group and Author now show the same live preview as Content Grid, Table and Section. The preview is built by the server from the form's current values with the component's real template, and shown in a sandboxed frame. Casino grid, Comparison table and News feed load their rows in the browser on the live site, so their preview shows the frame only.

Saved data, rendering on the live site and every other feature are unchanged.

## Numbers

Counted with `git diff --numstat` against v15, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **3** | **33** | **3** |
| New files | 0 | 0 | 0 |
| Modified files | 3 | 33 | 3 |
| Deleted files | 0 | 0 | 0 |

Tests: 942 pass; 2 new in `en/test/component-studio.test.js`.

## Migrations

**None.** No files deleted.

## Modified files (3)

| File | + | - |
|---|---:|---:|
| `en/static/js/component-studio.js` | 3 | 3 |
| `en/test/component-studio.test.js` | 16 | 0 |
| `en/worker/api.js` | 14 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v15-1-previews.patch
git apply ~/storage/downloads/lummet-tenant-v15-1-previews.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v15-1-previews-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v15-1-previews-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v15-1-previews-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/component-studio.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant: live preview for text, CTA, banner, FAQ and author components"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 22`.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
