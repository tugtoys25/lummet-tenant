# Release: AI Studio history (tenant v20.1)

Built on tenant v20.0. Control plane untouched. Nothing removed. **One migration** (0062, one new table).

## What changed

- AI Studio gets a **History** tab: which tool was run and what was saved, by whom and when, with OK or Failed. Admins see everyone (or only their own); other roles see only their own. Filter by tools run or things saved.
- Prompts and generated text are never stored. Records older than 365 days are removed when something is saved.
- AI Studio keeps working if the migration is not applied yet; the tab then says history is not switched on.
- Details: `docs/PLATFORM_UPGRADES.md` section 27.

## Numbers

Counted with `git diff --numstat` against v20.0, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **5** | **173** | **2** |

New: 1, modified: 4, deleted: 0. Tests: 1069 pass (full suite); focused set (7 files) 208 pass. Migrations: **one** (`en/migrations/0062_ai_studio_history.sql`, additive).
Deleted files: **none**.

## New files (1)

| File | + | - |
|---|---:|---:|
| `en/migrations/0062_ai_studio_history.sql` | 22 | 0 |

## Modified files (4)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 6 | 0 |
| `en/static/js/ai-studio.js` | 37 | 1 |
| `en/test/ai-studio.test.js` | 65 | 1 |
| `en/worker/ai/studio.js` | 43 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v20-1-ai-studio-history.patch
git apply ~/storage/downloads/lummet-tenant-v20-1-ai-studio-history.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v20-1-ai-studio-history-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v20-1-ai-studio-history-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v20-1-ai-studio-history-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/ai-studio.test.js test/site-upgrades.test.js test/component-studio.test.js test/generic-review-editor.test.js test/generic-content-engine-remaining-gaps.test.js test/geo-manager.test.js test/dashboard-shell.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v20.1: AI Studio history"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```

Expect `pass 208`.

## Migration (once per site database)

Run for each site's D1 database (names are in `wrangler.jsonc`: `freewin-db`, `lummet-db`, `levelcasino-db`, `clustercasino-db`, `neuroodds-db`, ...), from `~/lummet/lummet-tenant`:

```bash
npx wrangler d1 execute <database-name> --remote --file=en/migrations/0062_ai_studio_history.sql
npx wrangler d1 execute <database-name> --remote --command "SELECT name FROM sqlite_master WHERE name='ai_studio_history';"
```
It is safe to run twice (`IF NOT EXISTS`). Sites on the second Cloudflare account need that account's login or token.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
The new table can stay; nothing reads it after the rollback.
