# Release: Speed, fewer requests (tenant v22.2)

Built on tenant v22.1. Control plane untouched. Nothing removed. **No migration.**

## What changed

- **Browser caches the sidebar and geo lists** for 2 minutes, so moving between public pages no longer repeats 4 to 6 small requests each time.
- **Casino page loads only its own reviews** (title, rating, 200-character excerpt) instead of every review in full; the duplicate "Your Region" request is gone.
- **Chat:** old rate-limit rows are cleaned about 1 message in 20 instead of every message.
- Query counts measured and listed in `docs/PLATFORM_UPGRADES.md` section 40.

## Numbers

Counted with `git diff --numstat` against v22.1, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **7** | **60** | **8** |

New: 0, modified: 7, deleted: 0. Tests: 1138 pass (full suite); focused set (3 files) 50 pass. Migrations: **none**.
Deleted files: **none**.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

## Modified files (7)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/static/js/casino.js` | 2 | 2 |
| `en/test/perf-assets.test.js` | 24 | 0 |
| `en/worker/ai/security.js` | 7 | 4 |
| `en/worker/api.js` | 5 | 1 |
| `en/worker/asset-version.js` | 1 | 1 |
| `en/worker/static-assets.js` | 11 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-2-speed-requests.patch
git apply ~/storage/downloads/lummet-tenant-v22-2-speed-requests.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-2-speed-requests-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-2-speed-requests-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-2-speed-requests-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/perf-assets.test.js test/ai-studio.test.js test/ai-feedback.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v22.2: Speed, fewer requests and database calls"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current` and `pass 50`. No migration is needed. After deploying, hard-refresh once, open a casino page and then another page: in the Network tab the sidebar requests (`casinos/geo`, `news/list`, `categories/list`, `countries/list`) should show as cached on the second page.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Nothing is stored by this release, so there is nothing to clean up.
