# Release: which entrance a rating came from (tenant v21.1)

Built on tenant v21.0. Control plane untouched. Nothing removed. **One additive migration (0064).**

## What changed

- Each thumbs rating now remembers whether it came from the **floating widget** or the **lummet.<domain> page**. The server decides from the request address, so the browser cannot claim a different one. Older ratings stay unlabelled.
- AI Studio's chat-quality digest shows **By entrance (28 days)**: helpful share and number of ratings for each, so you can see if one performs worse.
- **Migration 0064** adds one nullable column, `ai_feedback.source`. Until it is run, ratings are still saved (without the entrance) and the digest omits that line.
- Details: `docs/PLATFORM_UPGRADES.md` section 33.

## Numbers

Counted with `git diff --numstat` against v21.0, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **6** | **106** | **8** |

New: 2, modified: 4, deleted: 0. Tests: 1103 pass (full suite); focused set (12 files) 242 pass. Migrations: **one, `0064_ai_feedback_source.sql` (additive; see below)**.
Deleted files: **none**.

## New files (2)

| File | + | - |
|---|---:|---:|
| `en/migrations/0064_ai_feedback_source.sql` | 8 | 0 |
| `en/test/ai-feedback-source.test.js` | 65 | 0 |

## Modified files (4)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 6 | 0 |
| `en/static/js/ai-studio.js` | 2 | 0 |
| `en/worker/ai/digest.js` | 6 | 1 |
| `en/worker/ai/feedback.js` | 19 | 7 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v21-1-feedback-source.patch
git apply ~/storage/downloads/lummet-tenant-v21-1-feedback-source.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v21-1-feedback-source-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v21-1-feedback-source-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v21-1-feedback-source-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/ai-feedback-source.test.js test/lummet-subdomain-parity.test.js test/ai-feedback-digest.test.js test/ai-feedback-fix.test.js test/ai-feedback.test.js test/ai-studio.test.js test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js test/geo-manager.test.js test/dashboard-shell.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v21.1: record which entrance each rating came from"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `pass 242`. **Migration 0064** (needs 0063 first) is not applied by the deploy. Run once per site database: paste `ALTER TABLE ai_feedback ADD COLUMN source TEXT;` into the D1 console, or run the `d1-migrate-file.yml` workflow with file `0064_ai_feedback_source.sql`. A second run says "duplicate column name", which is harmless.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
`git revert --no-edit HEAD` is safe even after the migration: the extra column is ignored by older code.
