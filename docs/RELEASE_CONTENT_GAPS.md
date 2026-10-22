# Release: Content gaps (tenant v21.2)

Built on tenant v21.1. Control plane untouched. Nothing removed. **No migration.**

## What changed

- AI Studio has a new **Content gaps** tab (admins only): questions that got a thumbs-down, not yet marked handled, from the last 60 days, grouped by topic, **where the site has nothing**. "Nothing" means the same lookup the public chat uses finds nothing for the topic word and nothing for the question itself. Covered topics stay with **Draft a fix** in the digest.
- Each gap offers **Research draft** and **News article draft** (the tool opens with the question filled in; nothing is published) and **Mark as handled** (marks the topic's questions reviewed so it leaves the list).
- No AI model is used to build the list, nothing new is stored. Covers ratings from the widget and the lummet. page.
- Details: `docs/PLATFORM_UPGRADES.md` section 34.

## Numbers

Counted with `git diff --numstat` against v21.1, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **5** | **151** | **3** |

New: 1, modified: 4, deleted: 0. Tests: 1107 pass (full suite); focused set (13 files) 246 pass. Migrations: **none**.
Deleted files: **none**.

## New files (1)

| File | + | - |
|---|---:|---:|
| `en/test/ai-content-gaps.test.js` | 67 | 0 |

## Modified files (4)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/static/js/ai-studio.js` | 37 | 1 |
| `en/worker/ai/digest.js` | 33 | 1 |
| `en/worker/ai/studio.js` | 5 | 1 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v21-2-content-gaps.patch
git apply ~/storage/downloads/lummet-tenant-v21-2-content-gaps.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v21-2-content-gaps-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v21-2-content-gaps-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v21-2-content-gaps-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/ai-content-gaps.test.js test/ai-feedback-source.test.js test/lummet-subdomain-parity.test.js test/ai-feedback-digest.test.js test/ai-feedback-fix.test.js test/ai-feedback.test.js test/ai-studio.test.js test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js test/geo-manager.test.js test/dashboard-shell.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v21.2: Content gaps in AI Studio"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `pass 246`. Needs migration 0063 (v20.2) applied, since the list comes from the feedback table.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Nothing is stored by this release, so there is nothing to clean up. Items you marked as handled stay marked.
