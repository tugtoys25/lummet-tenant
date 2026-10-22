# Release: header-hero split (tenant v22.40)

Built on tenant v22.39. Control plane untouched. **No migration. No behaviour change.** `en/worker/header-hero.js` (689 lines) becomes a facade over three parts in `en/worker/header-hero/`: `schema.js` (field table, limits, fonts), `clean.js` (validators and parsing) and `render.js` (classes, hero HTML, template variables). Dependencies run one way: schema, clean, render. All 27 exports keep their names, so no importer changes. Docs: `docs/ARCHITECTURE_HEADER_HERO.md`, `docs/PLATFORM_UPGRADES.md` section 78. New `test/header-hero-structure.test.js` (4 tests).

## Proof the behaviour is the same

- **Tokens:** nothing is missing from the new files except the import paths.
- **Differential run, old vs new:** 81,599 calls on every exported function with random and hostile values (markup, `javascript:` links, bad JSON, oversized text, YouTube and Vimeo URLs, slides, cards, every field): 21,680 distinct outcomes, **0 differences**. Changing one pixel value in a part is detected (32 differences).

## Numbers

Counted with `git diff --numstat` against v22.37, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **8** | **769** | **854** |

New: 5, modified: 3, deleted: 0. Tests: **1,276 pass** (1,272 before + 4 new). Migrations: **none**.

## New files (5)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_HEADER_HERO.md` | 11 | 0 |
| `en/test/header-hero-structure.test.js` | 33 | 0 |
| `en/worker/header-hero/clean.js` | 280 | 0 |
| `en/worker/header-hero/render.js` | 281 | 0 |
| `en/worker/header-hero/schema.js` | 147 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (3)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `docs/RELEASE_MIGRATIONS_REWRITE.md` | 3 | 187 |
| `en/worker/header-hero.js` | 4 | 667 |

## Install (Termux)

Needs v22.39 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-40-header-hero-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-40-header-hero-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/header-hero-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.40: header-hero split into 3 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1276`, `fail 0`.

After deploy (hard refresh once) open the home page and a page with a hero slider or video, and Admin, Header & Hero: save once. All must look and work as before.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
