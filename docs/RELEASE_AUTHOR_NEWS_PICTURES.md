# Release: author-page news pictures (tenant v18.9)

Built on tenant v18.8. Control plane untouched. Nothing removed, no migration.

## What changed

- News, research and platform-update cards on the author page show the full featured picture first and fall back to the
  thumbnail if one of them fails to load. Before, a missing thumbnail file removed the picture, so the news list looked image-less.

## Numbers

Counted with `git diff --numstat` against v18.8, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **3** | **19** | **7** |

New: 0, modified: 3, deleted: 0. Tests: 1015 pass (full suite); focused set 95 pass. Migrations: **none**.
Deleted files: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

## Modified files (3)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 4 | 0 |
| `en/test/generic-review-editor.test.js` | 7 | 0 |
| `en/worker/author-hub.js` | 8 | 7 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v18-9-author-news-pictures.patch
git apply ~/storage/downloads/lummet-tenant-v18-9-author-news-pictures.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v18-9-author-news-pictures-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v18-9-author-news-pictures-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v18-9-author-news-pictures-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v18.9: author-page news pictures"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 95`. Hard-refresh after the deploy.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
