# Release: router split (tenant v22.35)

Built on tenant v22.34. Control plane untouched. **No migration. No behaviour change.** `en/worker/routes.js` (714 lines, one function) becomes a 37-line entry plus four groups in `en/worker/routing/`.

## What changed

- `routing/public.js` (220), `routing/content.js` (228), `routing/dashboard.js` (97), `routing/system.js` (187). Each holds the original statements in the original order, as a function that returns the route object or `null`. `getRoute` returns the first hit, else `not_found`.
- Source-inspection tests that read `worker/routes.js` now use `test/support/routes-source.js` (entry plus groups): `ai-studio`, `index-structure`, `header-hero`, `site-upgrades`. New `test/routes-structure.test.js` (4 tests).
- Docs: `docs/ARCHITECTURE_ROUTES.md`, `docs/PLATFORM_UPGRADES.md` section 73.

## Proof the behaviour is the same

- **Differential run, old vs new `getRoute`:** 111,840 requests (every path literal and pattern in the file with sample segments, trailing slash, query string, GET/POST/HEAD/DELETE) reaching 143 distinct route types: **0 differences**. Changing one route name is detected (16 differences).
- **Scope check:** no free variables in the new files except `parseInt`.

## Numbers

Counted with `git diff --numstat` against v22.34, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **13** | **835** | **696** |

New: 7, modified: 6, deleted: 0. Tests: **1,246 pass** (1,242 before + 4 new). Migrations: **none**.

## New files (7)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_ROUTES.md` | 13 | 0 |
| `en/test/routes-structure.test.js` | 46 | 0 |
| `en/test/support/routes-source.js` | 11 | 0 |
| `en/worker/routing/content.js` | 228 | 0 |
| `en/worker/routing/dashboard.js` | 97 | 0 |
| `en/worker/routing/public.js` | 220 | 0 |
| `en/worker/routing/system.js` | 187 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/test/ai-studio.test.js` | 2 | 1 |
| `en/test/header-hero.test.js` | 2 | 1 |
| `en/test/index-structure.test.js` | 2 | 1 |
| `en/test/site-upgrades.test.js` | 2 | 1 |
| `en/worker/routes.js` | 15 | 692 |

## Install (Termux)

Needs v22.34 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-35-router-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-35-router-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/routes-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.35: router split into four ordered groups"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1246`, `fail 0`.

After deploy (hard refresh once) open the home page, a casino page, a news article, a dashboard page, /sitemap.xml and a media file. All must load as before.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
