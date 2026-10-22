# Release: Draft a fix from the digest (tenant v20.5)

Built on tenant v20.4. Control plane untouched. Nothing removed. **No migration.**

## What changed

- AI Studio, Chat feedback digest: every topic where the site **has content** gets its own **Draft a fix** button. It uses the topic's latest thumbs-down question and the same flow as v20.3: coverage check, a short FAQ drafted from the site's material alone, edit, then **Save as draft FAQ** (switched off until you turn it on). Topics with nothing on the site keep **Start a research draft**.
- No new route, no migration, nothing stored. Admins only.
- Details: `docs/PLATFORM_UPGRADES.md` section 31.

## Numbers

Counted with `git diff --numstat` against v20.4, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **3** | **8** | **1** |

New: 0, modified: 3, deleted: 0. Tests: 1091 pass (full suite); focused set (10 files) 230 pass (one existing test extended, no new ones). Migrations: **none**.
Deleted files: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

## Modified files (3)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 4 | 0 |
| `en/static/js/ai-studio.js` | 3 | 0 |
| `en/test/ai-feedback-digest.test.js` | 1 | 1 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v20-5-digest-fix.patch
git apply ~/storage/downloads/lummet-tenant-v20-5-digest-fix.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v20-5-digest-fix-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v20-5-digest-fix-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v20-5-digest-fix-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/ai-feedback-digest.test.js test/ai-feedback-fix.test.js test/ai-feedback.test.js test/ai-studio.test.js test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js test/geo-manager.test.js test/dashboard-shell.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v20.5: draft a fix from the digest"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `pass 230`. Needs migration 0063 applied, since the digest reads from it.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Nothing is stored by this release, so there is nothing to clean up.
