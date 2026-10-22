# Release: Ask the chat (tenant v21.5)

Built on tenant v21.4. Control plane untouched. Nothing removed. **No migration.**

## What changed

- AI Studio, Chat settings: **Try it before you save**. One question goes through the real chat (understand, retrieve, prompt, model, link and geo-fact guards) using the settings currently in the boxes, saved or not, and the answer is shown. Use it to check a tone or confirm a declined topic is declined.
- Admin only and rate-limited like the other AI Studio tools. It saves no conversation, counts against no free-message limit, writes no feedback or history, and never saves the settings.
- No migration. Details: `docs/PLATFORM_UPGRADES.md` section 37.

## Numbers

Counted with `git diff --numstat` against v21.4, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **7** | **102** | **2** |

New: 1, modified: 6, deleted: 0. Tests: 1119 pass (full suite); focused set (11 files) 136 pass. Migrations: **none**.
Deleted files: **none**.

## New files (1)

| File | + | - |
|---|---:|---:|
| `en/worker/ai/preview.js` | 41 | 0 |

## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 4 | 0 |
| `en/static/js/ai-studio.js` | 16 | 0 |
| `en/test/ai-house-rules.test.js` | 26 | 0 |
| `en/worker/ai/assistant.js` | 3 | 0 |
| `en/worker/ai/prompt.js` | 2 | 2 |
| `en/worker/ai/studio.js` | 10 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v21-5-ask-the-chat.patch
git apply ~/storage/downloads/lummet-tenant-v21-5-ask-the-chat.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v21-5-ask-the-chat-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v21-5-ask-the-chat-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v21-5-ask-the-chat-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/ai-house-rules.test.js test/ai-chat-report.test.js test/ai-content-gaps.test.js test/lummet-subdomain-parity.test.js test/ai-feedback-digest.test.js test/ai-feedback-fix.test.js test/ai-feedback.test.js test/ai-studio.test.js test/site-upgrades.test.js test/geo-manager.test.js test/dashboard-shell.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v21.5: Ask the chat (try settings before saving)"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `pass 136`. No migration is needed. After deploying, open AI Studio, Chat settings, and use Try it before you save.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Nothing is stored by this release, so there is nothing to clean up.
