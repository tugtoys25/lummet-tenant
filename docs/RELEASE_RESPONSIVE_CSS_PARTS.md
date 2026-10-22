# Release: responsive stylesheet in parts (tenant v22.43)

Built on tenant v22.42. Control plane untouched. **No migration. No behaviour change.** `en/static/css/responsive.css` (742 lines) is now generated from six parts in `en/css-src/responsive/` by `scripts/build-css.mjs` (fifth bundle). The cuts are between top-level blocks, so the cascade order is unchanged. Docs: `docs/ARCHITECTURE_CSS.md`, `docs/PLATFORM_UPGRADES.md` section 81.

## Proof the behaviour is the same

- The generated `static/css/responsive.css` is **byte-identical** to the old file (`cmp`): same bytes, same URL, same asset version.
- `test/css-build.test.js` covers five bundles (numbering, size, brace balance, up to date). `build-css.mjs --check` and `asset-version.mjs --check` pass.

## Numbers

Counted with `git diff --numstat` against v22.37, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **11** | **756** | **82** |

New: 6, modified: 4, deleted: 1. Tests: **1,285 pass** (1,282 before + 3 for the new bundle). Migrations: **none**.

## New files (6)

| File | + | - |
|---|---:|---:|
| `en/css-src/responsive/01-breakpoints-and-global-tweaks.css` | 84 | 0 |
| `en/css-src/responsive/02-bottom-nav-cta-scroll-top.css` | 183 | 0 |
| `en/css-src/responsive/03-typography-admin-tables-layout.css` | 147 | 0 |
| `en/css-src/responsive/04-footer-nav-search-auth-chips.css` | 163 | 0 |
| `en/css-src/responsive/05-cards-logo-news-search.css` | 77 | 0 |
| `en/css-src/responsive/06-full-bleed-and-card-borders.css` | 88 | 0 |

## Deleted files (1)

| File | + | - |
|---|---:|---:|
| `docs/RELEASE_HEADER_HERO_CSS_PARTS.md` | 0 | 78 |

## Modified files (4)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_CSS.md` | 2 | 1 |
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/scripts/build-css.mjs` | 1 | 1 |
| `en/test/css-build.test.js` | 2 | 2 |

## Install (Termux)

Needs v22.42 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-43-responsive-css-parts.patch
git apply ~/storage/downloads/lummet-tenant-v22-43-responsive-css-parts.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/css-build.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.43: responsive stylesheet in 6 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1285`, `fail 0`.

Nothing visible changes (same CSS bytes). To confirm, open the home page on a phone width once after a hard refresh.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
