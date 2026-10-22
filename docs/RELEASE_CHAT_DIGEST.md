# Release: weekly chat-quality digest (tenant v20.4)

Built on tenant v20.3. Control plane untouched. Nothing removed. **No migration.**

## What changed

- AI Studio, Chat feedback tab (admins only): a digest at the top shows this week vs last week (share rated helpful, change in points), the countries with the most thumbs-down, and the **topics that keep getting thumbs-down** over 28 days.
- For the top five topics it checks, with the same lookup the public chat uses, whether the site has content on them: **Site has content** or **Site has nothing on this**, the latter with **Start a research draft** (question pre-filled).
- No AI model is called, nothing is stored, no migration. It only reads `ai_feedback` (migration 0063, v20.2); with no table or data it shows nothing.
- Details: `docs/PLATFORM_UPGRADES.md` section 30.

## Numbers

Counted with `git diff --numstat` against v20.3, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **5** | **193** | **1** |

New: 2, modified: 3, deleted: 0. Tests: 1091 pass (full suite); focused set (10 files) 230 pass. Migrations: **none**.
Deleted files: **none**.

## New files (2)

| File | + | - |
|---|---:|---:|
| `en/test/ai-feedback-digest.test.js` | 71 | 0 |
| `en/worker/ai/digest.js` | 75 | 0 |

## Modified files (3)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 12 | 0 |
| `en/static/js/ai-studio.js` | 30 | 1 |
| `en/worker/ai/studio.js` | 5 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v20-4-chat-digest.patch
git apply ~/storage/downloads/lummet-tenant-v20-4-chat-digest.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v20-4-chat-digest-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v20-4-chat-digest-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v20-4-chat-digest-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/ai-feedback-digest.test.js test/ai-feedback-fix.test.js test/ai-feedback.test.js test/ai-studio.test.js test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js test/geo-manager.test.js test/dashboard-shell.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v20.4: weekly chat-quality digest"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `pass 230`. Needs migration 0063 (v20.2) applied, since the digest reads from it.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Nothing is stored by this release, so there is nothing to clean up.
