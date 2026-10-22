# Release: HTML sanitizer written as parts (tenant v22.54)

Built on tenant v22.53. Control plane untouched. **No migration. No behaviour change.** `en/worker/sanitize.js` (586 lines) is now a facade over `sanitize/policy.js`, `values.js`, `tags.js` and `pipeline.js`. It re-exports the same 4 names, so no importer changes (each function is exported where it is defined instead of by a final export line). The allow-lists are in `policy.js` only. Docs: `docs/ARCHITECTURE_SANITIZE.md`, `docs/PLATFORM_UPGRADES.md` section 92. New `test/sanitize-structure.test.js` (6 tests).

## Proof the behaviour is the same

- Old and new were run side by side on 330,747 calls, about 87,000 of whose inputs the sanitizer changed: classic XSS payloads, 6,000 generated and randomly corrupted documents, every attribute on ten tags against 160 values (schemes hidden by tabs, entities and case; styles with expressions, comments and escapes; `target`, `rel`, booleans), mutated URLs and styles, and a second pass over its own output. All results are identical.
- Mutation checks on each part (tag and attribute lists, URL schemes, CSS patterns, entity decoding, control-character stripping, comment removal, `target` and `rel` rules, null bytes) were all detected by the harness. The only ones not detected change nothing: a case flag on a name that is already lower-cased, and an iframe `http:` check that the earlier URL check makes unreachable (left as it was).

## Numbers

Counted with `git diff --numstat` against v22.53. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **8** | **662** | **561** |

New: 6, modified: 2, deleted: 0. Tests: **1,339 pass** (1,333 before + 6 new). Migrations: **none**.

## New files (6)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_SANITIZE.md` | 12 | 0 |
| `en/test/sanitize-structure.test.js` | 50 | 0 |
| `en/worker/sanitize/pipeline.js` | 128 | 0 |
| `en/worker/sanitize/policy.js` | 170 | 0 |
| `en/worker/sanitize/tags.js` | 159 | 0 |
| `en/worker/sanitize/values.js` | 131 | 0 |

## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/worker/sanitize.js` | 3 | 561 |

## Install (Termux)

Needs v22.53 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-54-sanitize-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-54-sanitize-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/sanitize-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.54: HTML sanitizer split into 4 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1339`, `fail 0`.

Nothing visible changes. To confirm, open a page with rich text (an article or a review): it looks as before, and links, images and embedded videos still show.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
