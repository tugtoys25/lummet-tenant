# Release: template renderer split into mixins (tenant v22.27)

Built on tenant v22.26. Control plane untouched. **No migration.** `en/worker/render.js` (908 lines, one class) keeps the core of `Renderer`; 20 of its methods move to five files in `en/worker/render/`.

## Why

`Renderer` held the template loader, variable replacement, components, navigation and banners, SEO output and the page pipeline in one class. Twelfth step of the restructuring.

## What changed

- **`en/worker/render.js`**: `Renderer` with the constructor, `getSiteContext`, `loadTemplate` and `render` (the page pipeline); the same exports as before (`Renderer`, `needsAdminAssets`, `selectAssetSet`, `expandIncludes`). Every controller still imports it the same way.
- **Five mixin files in `en/worker/render/`**: `variables.js` (variable replacement), `components.js`, `navigation.js` (nav, page nav, banners), `seo.js` (escape, SEO meta, schemas), `assets.js` (asset set choice and template includes). Methods are written exactly as in a class body.
- **`en/worker/render/install-methods.js`**: defines each mixin method on `Renderer.prototype` like a class would (not enumerable, writable, configurable) and throws if a name is defined twice.
- Lazy `import()` paths inside the moved methods now start with `../` (they moved one folder deeper); a test checks that they resolve.
- `docs/ARCHITECTURE_RENDERER.md`; `docs/PLATFORM_UPGRADES.md` section 65. New `test/render-structure.test.js` (4 tests).

## Proof the behaviour is the same

- Both versions loaded side by side: the same 25 members on `Renderer.prototype` with the same descriptors, names, lengths and method source text (apart from the lazy import paths), and the same keys on an instance.
- **298 rendered pages** (anonymous and admin), old vs new: identical (status, content type, redirect target, body hash).

## Numbers

Counted with `git diff --numstat` against v22.26, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **10** | **715** | **603** |

New: 8, modified: 2, deleted: 0. Tests: **1,216 pass** (1,212 before + 4 new). Migrations: **none**.

## New files (8)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_RENDERER.md` | 25 | 0 |
| `en/test/render-structure.test.js` | 46 | 0 |
| `en/worker/render/assets.js` | 34 | 0 |
| `en/worker/render/components.js` | 56 | 0 |
| `en/worker/render/install-methods.js` | 10 | 0 |
| `en/worker/render/navigation.js` | 250 | 0 |
| `en/worker/render/seo.js` | 103 | 0 |
| `en/worker/render/variables.js` | 169 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/worker/render.js` | 12 | 603 |

## Install (Termux)

Needs v22.26 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-27-renderer-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-27-renderer-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/render-structure.test.js test/template-includes.test.js test/perf-assets.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.27: template renderer split into mixins in worker/render/"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1216`, `fail 0`.

Every page goes through this class, so after deploy open: the home page, a casino page, a news article, a dashboard page and the page navigation menu (header, footer, mobile). All should look as before.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
