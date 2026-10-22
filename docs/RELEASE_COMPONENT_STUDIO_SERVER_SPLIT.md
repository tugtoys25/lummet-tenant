# Release: Component Studio server module split (tenant v22.46)

Built on tenant v22.45. Control plane untouched. **No migration. No behaviour change.** `en/worker/component-studio.js` (645 lines) becomes a facade over five parts in `en/worker/component-studio/`: `shared` (limits, cleaners, `cleanPicks`), `grid`, `table`, `section` and `dispatch`. It re-exports the same 21 names, so `component-engine.js`, `comparison-design.js` and `api/routes/components.js` are unchanged. Docs: `docs/ARCHITECTURE_COMPONENT_STUDIO_SERVER.md`, `docs/PLATFORM_UPGRADES.md` section 84. New `test/component-studio-server-structure.test.js` (4 tests).

**Also restored:** the release notes `docs/RELEASE_*.md` of v22.39 to v22.45. Each of those releases removed the previous one's note, because my work tree did not contain the file. They are listed below as new files.

## Proof the behaviour is the same

- **Tokens:** nothing is missing from the new files except the import paths.
- **Differential run, old vs new:** 28,799 calls on every exported function, with hostile and random settings for the grid, table and section (wrong types, oversized lists, markup, `javascript:` links, bad slugs, pick lists with unknown sources, JSON text and non-JSON) and renders against a seeded database (casinos, news, authors, research, updates): 5,306 distinct outcomes, **0 differences**. One change in each of the five parts is detected.

## Numbers

Counted with `git diff --numstat` against v22.37, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **15** | **1287** | **635** |

New: 12, modified: 3, deleted: 0. Tests: **1,302 pass** (1,298 before + 4 new). Migrations: **none**.

## New files (12)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_COMPONENT_STUDIO_SERVER.md` | 13 | 0 |
| `docs/RELEASE_HEADER_HERO_CSS_PARTS.md` | 78 | 0 |
| `docs/RELEASE_HEADER_HERO_SPLIT.md` | 74 | 0 |
| `docs/RELEASE_RESEARCH_CONTROLLER_SPLIT.md` | 73 | 0 |
| `docs/RELEASE_RESPONSIVE_CSS_PARTS.md` | 76 | 0 |
| `docs/RELEASE_SETTINGS_FORM_SPLIT.md` | 76 | 0 |
| `en/test/component-studio-server-structure.test.js` | 36 | 0 |
| `en/worker/component-studio/dispatch.js` | 63 | 0 |
| `en/worker/component-studio/grid.js` | 135 | 0 |
| `en/worker/component-studio/section.js` | 230 | 0 |
| `en/worker/component-studio/shared.js` | 91 | 0 |
| `en/worker/component-studio/table.js` | 138 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (3)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 11 | 0 |
| `docs/RELEASE_MIGRATIONS_REWRITE.md` | 187 | 3 |
| `en/worker/component-studio.js` | 6 | 632 |

## Install (Termux)

Needs v22.45 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-46-component-studio-server-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-46-component-studio-server-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/component-studio-server-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.46: Component Studio server module split into 5 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1302`, `fail 0`.

After deploy open a page that shows a Content grid, a Data table and a Custom section (Admin, Components, "preview" works too), and save a component. All must look and work as before.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
