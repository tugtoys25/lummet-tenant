# Release: one public chat, two entrances (tenant v21.0)

Built on tenant v20.5. Control plane untouched. Nothing removed. **No migration.**

## What changed

- The floating widget and the dedicated page on `lummet.<your domain>` (`en/lummet/index.html`) now run through the **same server handlers**. Before, the subdomain kept its own copy that had drifted (no feedback, a different default country, no clear-chat). Now everything built for the chat applies to both: sportsbooks, partners, custom items and research, geo rules, free-message limit and sign-in prompt, rate limits, 24-hour memory.
- The subdomain page gets the same thumbs row as the widget (same wording and reasons). Feedback from both lands in the same table, so AI Studio's Chat feedback tab, digest and fixes cover both.
- **+ New Chat** on the page clears the saved conversation on the server, like the widget does (opening an old chat from the sidebar does not).
- Old paths `/api/chat` and `/api/chat/stream` stay; `/api/chat/clear` and `/api/feedback` are new. The admin panel and `/api/admin/*` are unchanged.
- A parity test sends the same question through both entrances and fails if answers, memory, feedback or limits differ.
- Details: `docs/PLATFORM_UPGRADES.md` section 32.

## Numbers

Counted with `git diff --numstat` against v20.5, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **4** | **189** | **149** |

New: 1, modified: 3, deleted: 0. Tests: 1098 pass (full suite); focused set (11 files) 237 pass. Migrations: **none**.
Deleted files: **none**.

## New files (1)

| File | + | - |
|---|---:|---:|
| `en/test/lummet-subdomain-parity.test.js` | 92 | 0 |

## Modified files (3)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 8 | 0 |
| `en/lummet/index.html` | 67 | 4 |
| `en/worker/lummet/router.js` | 22 | 145 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v21-0-one-chat.patch
git apply ~/storage/downloads/lummet-tenant-v21-0-one-chat.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v21-0-one-chat-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v21-0-one-chat-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v21-0-one-chat-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/lummet-subdomain-parity.test.js test/ai-feedback-digest.test.js test/ai-feedback-fix.test.js test/ai-feedback.test.js test/ai-studio.test.js test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js test/geo-manager.test.js test/dashboard-shell.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v21.0: one public chat for widget and subdomain"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `pass 237`. Feedback from the subdomain needs migration 0063 applied (same as the widget).

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Feedback already saved stays in the table.
