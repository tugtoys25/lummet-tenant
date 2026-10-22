# Release: Security rotation (tenant v22.13)

Built on tenant v22.11. Control plane untouched. Nothing removed. **One migration: 0066.**

## Why

A production database dump (users, password hashes, sessions) was committed to git history long ago. It left the files in v22.5 but stays in history. This release signs everybody out, upgrades weak password hashes at login, and adds a tested script that removes the dump from the whole git history.

## What changed

- **Migration `0066_invalidate_sessions.sql`:** deletes all sessions and pending password-reset links. Users are kept. Safe to run twice.
- **Old unsalted SHA-256 password hashes are upgraded to salted PBKDF2** right after a successful sign-in.
- **`docs/security/purge-history.sh`:** purges `levelcasd1.sql` / `.zip` from all history, drops the apply/revert noise commits, backs up first, asks for typed confirmations, then force-pushes.
- Details and what to rotate by hand: `docs/PLATFORM_UPGRADES.md` section 51.

## Order to do it

1. Install this release, commit, push, deploy (below).
2. Run the migration on every database: `gh workflow run d1-migrate-file.yml -f file=0066_invalidate_sessions.sql`.
3. Sign in again and change your admin password (Dashboard, account). Do the same for every admin and editor.
4. Run `purge-history.sh` (it needs a pushed, clean `main`).

## Numbers

Counted with `git diff --numstat` against v22.11, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **11** | **180** | **7** |

New: 3, modified: 8, deleted: 0. Tests: 1155 pass (full suite); focused set (2 files) 17 pass. Migrations: **0066**.

## New files (3)

| File | + | - |
|---|---:|---:|
| `docs/security/purge-history.sh` | 97 | 0 |
| `en/migrations/0066_invalidate_sessions.sql` | 7 | 0 |
| `en/test/auth-rehash.test.js` | 46 | 0 |

Deleted files: **none**.

## Modified files (8)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 11 | 0 |
| `docs/RELEASE_PAGE_CACHE.md` | 1 | 1 |
| `docs/RELEASE_PAGE_CACHE_FIX.md` | 1 | 1 |
| `docs/RELEASE_PAGE_CACHE_KEYS.md` | 1 | 1 |
| `docs/RELEASE_PAGE_CACHE_PROBE.md` | 1 | 1 |
| `docs/RELEASE_PAGE_CACHE_SOURCE.md` | 1 | 1 |
| `docs/RELEASE_PAGE_MEMORY.md` | 1 | 1 |
| `en/worker/auth.js` | 13 | 1 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-13-security-rotate.patch
git apply ~/storage/downloads/lummet-tenant-v22-13-security-rotate.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v22-13-security-rotate-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v22-13-security-rotate-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v22-13-security-rotate-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node scripts/asset-version.mjs --check
node --test --test-concurrency=1 test/auth-rehash.test.js test/auth-password-newsletter.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant v22.13: Security rotation (migration 0066, hash upgrade, history purge script)"
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect `asset version is current` and `pass 17`.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
