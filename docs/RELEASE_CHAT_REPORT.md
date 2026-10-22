# Release: weekly chat-quality email (tenant v21.3)

Built on tenant v21.2. Control plane untouched. Nothing removed. **No migration.**

## What changed

- AI Studio, Chat feedback tab: **Email me this report every week**, **Stop the weekly email** and **Send me one now**. It is **opt-in per admin**: nobody gets mail unless they turn it on for themselves, and only users who are still admin or super admin receive it.
- The email (about every 7 days, using the existing 6-hourly schedule) has this week against last week, the widget-versus-subdomain comparison (when migration 0064 is in), the top thumbs-down topics and the top three content gaps, with a link to AI Studio. Visitor questions are escaped. Nothing is sent when there is nothing to report. No AI model is used.
- Uses the same email setup as the site's other emails (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`). Without it, **Send me one now** shows the error and nothing breaks.
- No migration. The opted-in admins are stored in the existing `settings` table; the 7-day marker in `system_settings`.
- Details: `docs/PLATFORM_UPGRADES.md` section 35.

## Numbers

Counted with `git diff --numstat` against v21.2, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **7** | **236** | **1** |

New: 2, modified: 5, deleted: 0. Tests: 1112 pass (full suite); focused set (14 files) 215 pass. Migrations: **none**.
Deleted files: **none**.

## New files (2)

| File | + | - |
|---|---:|---:|
| `en/test/ai-chat-report.test.js` | 79 | 0 |
| `en/worker/ai/report.js` | 80 | 0 |

## Modified files (5)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 8 | 0 |
| `en/static/js/ai-studio.js` | 23 | 0 |
| `en/worker/ai/studio.js` | 20 | 0 |
| `en/worker/cron.js` | 18 | 0 |
| `en/worker/index.js` | 8 | 1 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v21-3-chat-report.patch
git apply ~/storage/downloads/lummet-tenant-v21-3-chat-report.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v21-3-chat-report-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v21-3-chat-report-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v21-3-chat-report-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/ai-chat-report.test.js test/ai-content-gaps.test.js test/ai-feedback-source.test.js test/lummet-subdomain-parity.test.js test/ai-feedback-digest.test.js test/ai-feedback-fix.test.js test/ai-feedback.test.js test/ai-studio.test.js test/email-campaigns-subscriptions.test.js test/cron-health.test.js test/site-upgrades.test.js test/component-studio.test.js test/geo-manager.test.js test/dashboard-shell.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v21.3: weekly chat-quality email to admins"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `pass 215`. Needs migration 0063 (v20.2) applied, since the report reads the feedback table. After deploying, open AI Studio, Chat feedback, and turn the email on for yourself.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Opt-ins stay in the `settings` table (key `ai_chat_report_to`) and are ignored by older code; no emails are sent after a revert.
