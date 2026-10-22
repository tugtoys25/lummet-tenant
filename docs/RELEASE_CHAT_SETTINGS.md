# Release: chat settings (tone, topics to decline, guidance) (tenant v21.4)

Built on tenant v21.3. Control plane untouched. Nothing removed. **No migration.**

## What changed

- AI Studio has a new **Chat settings** tab (admins only) with three optional settings: **Tone** (Friendly default, Professional, Concise), **Topics to politely decline** (up to 10 lines) and **Extra guidance** (up to 500 characters).
- One setting changes **both the floating widget and the lummet. page**, from the next message, because they share one prompt builder.
- The section sits **below** the chat's built-in strict rules: it can make the chat shorter, more formal or more reserved, but cannot make it invent facts, links or sources. Nothing set means the prompt is unchanged. Declining is done by the model: reliable, but not a hard content filter.
- Saving is recorded in History as "Changed chat settings" (the text itself is not copied there). **Back to defaults** clears all three.
- No migration; stored in the existing `settings` table. Details: `docs/PLATFORM_UPGRADES.md` section 36.

## Numbers

Counted with `git diff --numstat` against v21.3, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **6** | **218** | **2** |

New: 2, modified: 4, deleted: 0. Tests: 1117 pass (full suite); focused set (13 files) 182 pass. Migrations: **none**.
Deleted files: **none**.

## New files (2)

| File | + | - |
|---|---:|---:|
| `en/test/ai-house-rules.test.js` | 83 | 0 |
| `en/worker/ai/house-rules.js` | 63 | 0 |

## Modified files (4)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 12 | 0 |
| `en/static/js/ai-studio.js` | 38 | 2 |
| `en/worker/ai/prompt.js` | 9 | 0 |
| `en/worker/ai/studio.js` | 13 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v21-4-chat-settings.patch
git apply ~/storage/downloads/lummet-tenant-v21-4-chat-settings.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v21-4-chat-settings-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v21-4-chat-settings-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v21-4-chat-settings-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/ai-house-rules.test.js test/ai-chat-report.test.js test/ai-content-gaps.test.js test/ai-feedback-source.test.js test/lummet-subdomain-parity.test.js test/ai-feedback-digest.test.js test/ai-feedback-fix.test.js test/ai-feedback.test.js test/ai-studio.test.js test/site-upgrades.test.js test/component-studio.test.js test/geo-manager.test.js test/dashboard-shell.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v21.4: chat settings: tone, topics to decline, extra guidance"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `pass 182`. No migration is needed. After deploying, open AI Studio, Chat settings, and try a setting on one site.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Saved settings stay in the `settings` table (keys `ai_chat_tone`, `ai_chat_decline`, `ai_chat_notes`) and are ignored by older code, so after a revert the chat goes back to its default prompt.
