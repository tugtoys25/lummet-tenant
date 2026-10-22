# Release: fix a badly rated chat answer (tenant v20.3)

Built on tenant v20.2. Control plane untouched. Nothing removed. **No migration.**

## What changed

- AI Studio, Chat feedback tab: each thumbs-down gets **Draft a fix**. It first shows what the site actually has on the visitor's question (the same lookup the public chat uses). If there is nothing, the AI is not called and you are offered a research draft with the question filled in. If there is something, the AI drafts a short FAQ answer from that material alone (links removed unless they come from the site).
- **Save as draft FAQ** adds an FAQ that is switched OFF and marks the feedback reviewed. A **Draft FAQs** list below lets admins **Switch on** (the public chat then uses it), **Delete** (only while off), with a duplicate check. Admins only; everything is recorded in History.
- Details: `docs/PLATFORM_UPGRADES.md` section 29.

## Numbers

Counted with `git diff --numstat` against v20.2, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **5** | **244** | **3** |

New: 1, modified: 4, deleted: 0. Tests: 1087 pass (full suite); focused set (9 files) 226 pass. Migrations: **none**.
Deleted files: **none**.

## New files (1)

| File | + | - |
|---|---:|---:|
| `en/test/ai-feedback-fix.test.js` | 104 | 0 |

## Modified files (4)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 12 | 0 |
| `en/static/css/header-hero.css` | 2 | 0 |
| `en/static/js/ai-studio.js` | 45 | 2 |
| `en/worker/ai/studio.js` | 81 | 1 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v20-3-chat-fix.patch
git apply ~/storage/downloads/lummet-tenant-v20-3-chat-fix.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v20-3-chat-fix-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v20-3-chat-fix-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v20-3-chat-fix-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/ai-feedback-fix.test.js test/ai-feedback.test.js test/ai-studio.test.js test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js test/geo-manager.test.js test/dashboard-shell.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v20.3: fix a badly rated chat answer"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `pass 226`. Needs migration 0063 (v20.2) to have been applied, since the feedback list comes from it.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
FAQs already saved stay in the FAQ list (switched off or on as you left them).
