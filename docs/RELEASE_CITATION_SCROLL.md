# Release: research citation numbers jump to the right source and stay there (tenant v17.3)

Built on tenant v17.2. Control plane untouched.

## The problem

On research pages, tapping a citation number such as [3] moved the page, then bounced it back, or stopped in the wrong place. I reproduced it in a real browser: on phones the page scrolls smoothly, pictures above the sources load late and change the page height while the scroll is animating, so the animation is thrown off. In my test the page ended 5,480 px away from the source. The footnote list also added a second offset on top of the site-wide one.

## The fix

- New `en/static/js/anchor-scroll.js` (loaded on every page): a tap on a citation number jumps instantly to its source, then re-aligns it for up to 1.5 s while pictures finish loading. Any touch, scroll or key press by the reader stops the re-aligning at once. The address gets the `#research-source-N` hash without adding a history step, and the source gets the keyboard focus.
- `en/static/css/research.css`: the footnote list no longer adds its own offset (the site-wide offset under the sticky bars stays), and the source you jumped to is highlighted.

The numbering itself was already right (the number in the text and the footnote id come from the same list), and a test now guards it. Same test page after the fix: the source lands 84 px below the top (just under the sticky bar) and does not move.

## Numbers

Counted with `git diff --numstat` against v17.2, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **4** | **72** | **1** |

Tests: 963 pass; 3 new. Migrations: **none**. Deleted files: **none**.

## New files (1)

| File | + | - |
|---|---:|---:|
| `en/static/js/anchor-scroll.js` | 52 | 0 |

## Modified files (3)

| File | + | - |
|---|---:|---:|
| `en/static/css/research.css` | 2 | 1 |
| `en/templates/layout/base.html` | 1 | 0 |
| `en/test/component-studio.test.js` | 17 | 0 |

## Install (Termux), pick ONE

```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v17-3-citation-scroll.patch
git apply ~/storage/downloads/lummet-tenant-v17-3-citation-scroll.patch
```
or the script: `unzip -p ~/storage/downloads/lummet-tenant-v17-3-citation-scroll-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh && bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v17-3-citation-scroll-full.zip ~/lummet/lummet-tenant && bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v17-3-citation-scroll-full.zip ~/lummet/lummet-tenant`

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/component-studio.test.js 2>&1 | tail -10
cd .. && git add -A && git commit -m "Tenant: research citation links jump to the source and stay there"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Expect `pass 43`. Hard-refresh a research page afterwards (the old stylesheet may be cached).

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
