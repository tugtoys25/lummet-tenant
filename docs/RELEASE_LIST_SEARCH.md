# Release: search in every dashboard list, including Platform updates (tenant v18.3)

Built on tenant v18.2. Control plane untouched. Nothing removed, no migration.

## What changed

- The list search (search box, count, click-to-sort headings, "/" shortcut) now shows **as soon as a list has one row**
  (before, it waited for 6), so short lists such as **Platform updates** have it too.
- **Card lists** get it as well: **Inquiries** and **Submissions**.
- Every other table in the dashboard (casinos, reviews, news, research, payment methods, pages, country pages,
  categories, SEO, components, generic content, comparisons, users, permissions, analytics, ...) already used the
  same script and keeps working. Only the Research datasets grid editor is left alone on purpose, since it is an
  editing grid, not a list.

## Numbers

Counted with `git diff --numstat` against v18.2, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **4** | **66** | **2** |

Tests: 991 pass; 2 new. Migrations: **none**. Deleted files: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

## Modified files (4)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 1 | 1 |
| `en/static/css/header-hero.css` | 1 | 0 |
| `en/static/js/admin-list-search.js` | 50 | 1 |
| `en/test/site-upgrades.test.js` | 14 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v18-3-list-search.patch
git apply ~/storage/downloads/lummet-tenant-v18-3-list-search.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v18-3-list-search-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v18-3-list-search-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v18-3-list-search-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/site-upgrades.test.js test/component-studio.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v18.3: list search on every list"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 71`. Hard-refresh after the deploy (old scripts and styles may be cached).

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
