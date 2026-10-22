# Release: media upload module written as parts (tenant v22.53)

Built on tenant v22.52. Control plane untouched. **No migration. No behaviour change.** `en/worker/media-upload.js` (572 lines) is now a facade over `media-upload/http.js`, `files.js`, `upload.js`, `delete.js` and `serve.js`. It re-exports the same 8 names, so no importer changes. Docs: `docs/ARCHITECTURE_MEDIA_UPLOAD.md`, `docs/PLATFORM_UPGRADES.md` section 91. New `test/media-upload-structure.test.js` (5 tests).

## Proof the behaviour is the same

- Every export was run old against new on a seeded database: about 900 calls with a fixed clock and seeded randomness against a seeded database and a recording R2 mock: file validation at every limit, key and URL generation, byte ranges, 60 uploads (bad files, failing R2, no bucket, database down), deletes (owner, other editor, admin, viewer, missing, R2 failure) and serving (whole file, ranges, HEAD, 304, missing, failing head). Responses, R2 calls, saved rows and logged errors are identical.
- Mutation checks on each part (size limits, thumbnail widths, key shape, saved fields, owner rule, R2 delete, range maths, headers, status codes) were all detected by the harness.

## Numbers

Counted with `git diff --numstat` against v22.52. Moved code counts as added and deleted.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **9** | **623** | **553** |

New: 7, modified: 2, deleted: 0. Tests: **1,333 pass** (1,328 before + 5 new). Migrations: **none**.

## New files (7)

| File | + | - |
|---|---:|---:|
| `docs/ARCHITECTURE_MEDIA_UPLOAD.md` | 13 | 0 |
| `en/test/media-upload-structure.test.js` | 44 | 0 |
| `en/worker/media-upload/delete.js` | 59 | 0 |
| `en/worker/media-upload/files.js` | 234 | 0 |
| `en/worker/media-upload/http.js` | 17 | 0 |
| `en/worker/media-upload/serve.js` | 101 | 0 |
| `en/worker/media-upload/upload.js` | 141 | 0 |

## Modified files (2)

| File | + | - |
|---|---:|---:|
| `docs/PLATFORM_UPGRADES.md` | 9 | 0 |
| `en/worker/media-upload.js` | 5 | 553 |

## Install (Termux)

Needs v22.52 applied first.

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v22-53-media-upload-split.patch
git apply ~/storage/downloads/lummet-tenant-v22-53-media-upload-split.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test --test-concurrency=1 test/media-upload-structure.test.js 2>&1 | tail -10
node --test --test-concurrency=1 test/*.test.js 2>&1 | tail -12
cd .. && git add -A && git commit -m "Tenant v22.53: media upload module split into 5 parts"
gh auth switch -u lvl-code && gh auth setup-git
git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
Expect the full suite `pass 1333`, `fail 0`.

Nothing visible changes. To confirm, open the media library, upload an image, then delete it; play a video on a page.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main
gh workflow run multiple.yml && gh workflow run deploy-to-second.yml
```
