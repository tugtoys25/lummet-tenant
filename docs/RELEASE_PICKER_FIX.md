# Release: fix for "url is not defined" in the page picker (tenant v16.1)

Built on tenant v16 (commit `10f2bd1`). Control plane untouched.

## The bug

Opening any picker (Pick a page, Search and add) showed **"url is not defined"**. The search route `component/pick-search` read the request address without creating it first. My earlier browser checks used a stand-in for this route, so they did not catch it. That was my miss.

## The fix

`en/worker/api.js`: the route now builds its own `url`. Nothing else changes.

## Tests that would have caught it

The new tests in `en/test/component-studio.test.js` call the **real** API router (`handleAPI`) for `pick-search` (every source, plus the link mode and an unknown source), `pick-resolve`, `preview` (section and grid) and `create` (settings cleaned on save). 30 tests in that file; the full suite passes.

## Numbers

Counted with `git diff --numstat` against v16, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **2** | **47** | **0** |

Migrations: **none**. Deleted files: **none**.

## Modified files (2)

| File | + | - |
|---|---:|---:|
| `en/test/component-studio.test.js` | 46 | 0 |
| `en/worker/api.js` | 1 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v16-1-picker-fix.patch
git apply ~/storage/downloads/lummet-tenant-v16-1-picker-fix.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v16-1-picker-fix-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v16-1-picker-fix-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v16-1-picker-fix-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/component-studio.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant: fix url not defined in component pick-search"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 30`.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
