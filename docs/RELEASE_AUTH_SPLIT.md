# Release: authentication module split (tenant v22.47)

Built on tenant v22.46. Control plane untouched. **No migration. No behaviour change.** `en/worker/auth.js` (622 lines) becomes a facade over four parts in `en/worker/auth/`: `security` (Turnstile, rate limit, IP hash, tokens, session cookie), `password` (PBKDF2 hash and verify), `session` (login, logout, current user, roles, cookies) and `account` (register, forgot, reset, change password). The 12 public exports keep their names, so no importer changes. Docs: `docs/ARCHITECTURE_AUTH.md`, `docs/PLATFORM_UPGRADES.md` section 85. New `test/auth-structure.test.js` (5 tests).

## Proof the behaviour is the same

- **Tokens:** nothing is missing from the new files except the import paths; no new code.
- **Scenario differential, old vs new**, with the clock, random numbers and Turnstile and Resend answers fixed: 313 steps. They cover 70 mixed register and login attempts (good and bad emails, passwords, tokens, IPs, hosts), a legacy SHA-256 account and its upgrade to PBKDF2, the rate limit hitting and clearing as the clock moves 14.5 and 15.5 minutes, over 25 cookie shapes for `getCurrentUser` and `getCookie`, `requireRole` on every role pair, hashing and verifying including odd stored hashes, forgot, reset and change password with the real emailed token, and logout. Status codes, headers, bodies, the emails sent and the final contents of `users`, `sessions`, `password_resets`, `auth_attempts` and `newsletter_subscribers`: **0 differences**. Changing the PBKDF2 iteration count, the rate-limit window or one message in a part is detected.

## Numbers

Counted with `git diff --numstat` against v22.37, excluding the generated files. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **8** | **676** | **617** |

New: 6, modified: 2, deleted: 0. Tests: **1,307 pass** (1,302 before + 5 new). Migrations: **none**.

## New files (6)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_AUTH.md` | 12 | 0 |
| `en/test/auth-structure.test.js` | 44 | 0 |
| `en/worker/auth/account.js` | 190 | 0 |
| `en/worker/auth/password.js` | 93 | 0 |
| `en/worker/auth/security.js` | 104 | 0 |
| `en/worker/auth/session.js` | 219 | 0 |

## Deleted files (0)

| File | + | - |
|---|---:|---:|


## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 10 | 0 |
| `en/worker/auth.js` | 4 | 617 |

## Install (Termux)

Needs v22.46 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-47-auth-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-47-auth-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/auth-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.47: authentication module split into 4 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1307`, `fail 0`.

After deploy: log out and in again, register a test account, and use "Forgot password" once (the email must arrive and the link must work). Change the password from the account page. All must behave as before.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
