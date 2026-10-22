# Release: chat feedback and migration workflow (tenant v20.2)

Built on tenant v20.1. Control plane untouched. Nothing removed. **One migration** (0063, one new table) and one new GitHub workflow.

## What changed

- The public Lummet AI shows thumbs up / down after each successful answer; a thumbs down offers four quick reasons. No login needed, limited to 30 ratings per visitor per 15 minutes.
- Privacy: nothing identifying stored. For a thumbs down the question and answer are copied from the saved conversation on the server (not from the browser); a thumbs up stores only the count. Removed after 180 days.
- AI Studio gets a **Chat feedback** tab (admins only): ratings, share found helpful, thumbs-downs waiting for review, common reasons, and the questions answered badly, with "Mark reviewed".
- New workflow `d1-migrate-file.yml`: runs one migration file on every site database on both Cloudflare accounts (14 jobs).
- AI Studio and feedback rate limiting share one helper that no longer loses a count when two requests land in the same millisecond.
- Details: `docs/PLATFORM_UPGRADES.md` section 28.

## Numbers

Counted with `git diff --numstat` against v20.1, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **11** | **445** | **18** |

New: 5, modified: 6, deleted: 0. Tests: 1079 pass (full suite); focused set (8 files) 218 pass. Migrations: **one** (`en/migrations/0063_ai_feedback.sql`, additive).
Deleted files: **none**.

## New files (5)

| File | + | - |
|---|---:|---:|
| `.github/workflows/d1-migrate-file.yml` | 59 | 0 |
| `en/migrations/0063_ai_feedback.sql` | 22 | 0 |
| `en/test/ai-feedback.test.js` | 119 | 0 |
| `en/worker/ai/feedback.js` | 88 | 0 |
| `en/worker/ai/rate.js` | 17 | 0 |

## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 12 | 0 |
| `en/static/css/lummet-ai.css` | 6 | 0 |
| `en/static/js/ai-studio.js` | 40 | 1 |
| `en/static/js/lummet-ai.js` | 56 | 0 |
| `en/worker/ai/studio.js` | 18 | 16 |
| `en/worker/api.js` | 8 | 1 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v20-2-chat-feedback.patch
git apply ~/storage/downloads/lummet-tenant-v20-2-chat-feedback.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v20-2-chat-feedback-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v20-2-chat-feedback-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v20-2-chat-feedback-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/ai-feedback.test.js test/ai-studio.test.js test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js test/geo-manager.test.js test/dashboard-shell.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v20.2: chat feedback and migration workflow"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `pass 218`.

## Migrations (after the push)

One tap per file, on every database of both accounts:

```bash
gh workflow run d1-migrate-file.yml -f file=0062_ai_studio_history.sql
gh workflow run d1-migrate-file.yml -f file=0063_ai_feedback.sql
gh run list --workflow=d1-migrate-file.yml --limit 4
```
Each run shows 14 jobs (7 per account); both files are safe to run twice. If you already ran 0062 by hand, skip it.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
The table can stay; nothing reads it after the rollback.
