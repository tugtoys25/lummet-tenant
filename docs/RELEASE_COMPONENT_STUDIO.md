# Release: Component Studio, visual editing for every component type (tenant v15)

Built on tenant v14 (commit `b96decd`). Control plane untouched.

## What changed

Dashboard > Components no longer asks anyone to type JSON or code. Each component type shows a form of plain fields, pickers and (for the new types) a live preview. See `docs/COMPONENTS.md`.

- **Text, CTA, Banner, FAQ group, Author, Casino grid, Comparison table, News feed**: visual forms. Text uses a word-processor style editor; the author type can pick an existing author; FAQ is a list of question/answer rows; buttons take a page picker instead of pasted addresses.
- **Three new types**: *Content Grid* (pick or auto-fill casinos, news, research, authors, updates, sportsbooks, affiliate partners, custom content and pictures, with columns, card styles and what each card shows), *Table* (your own table, or a casino comparison from picked or top-rated casinos), *Custom Section* (background, spacing, 1 to 3 columns and blocks: heading, text, picture, button, list, video, feature cards, numbers, space, line).
- **Pickers**: search by name per kind, reorder with arrows, only published items; a page picker for every link; the Media library for pictures.
- **Nothing is destroyed**: the raw Content and Settings boxes stay under "Show the raw ... (for developers)" and stay in step; settings keys the form does not know are kept; Custom HTML and Hero keep their existing editors; a text block with unusual HTML is shown as HTML and left untouched until you change it.
- **Server checks**: every value of the new types is cleaned on save and again when rendered (safe links and pictures, validated colours, simple tags only in text blocks, YouTube/Vimeo through fixed templates). `link` of CTA/Banner and `limit` of grid/table/feed are checked; all other values of older types pass through unchanged.
- New API routes: `component/preview`, `component/pick-search` (read permission "components"), `component/pick-resolve`.

## Numbers

Counted with `git diff --numstat` against v14, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **13** | **2180** | **11** |
| New files | 6 | 2047 | 0 |
| Modified files | 7 | 133 | 11 |
| Deleted files | 0 | 0 | 0 |

Tests: 940 pass serially (`node --test`); 17 are new, in `en/test/component-studio.test.js` (cleaners, sources against a real SQLite database, rendering, XSS escaping, wiring). One older test was updated because component settings are now cleaned through one shared function. The editor was also checked in a real browser at 1280 and 390 wide (pick, reorder, table edit, section blocks, preview, save, legacy components load unchanged).

## Migrations

**None.** New component types are stored in the existing `components.type` column (no CHECK constraint).

## Deleted files

None.

## New files (6)

| File | + | - |
|---|---:|---:|
| `docs/COMPONENTS.md` | 37 | 0 |
| `en/static/css/component-blocks.css` | 134 | 0 |
| `en/static/js/component-studio.js` | 706 | 0 |
| `en/test/component-studio.test.js` | 122 | 0 |
| `en/worker/component-sources.js` | 403 | 0 |
| `en/worker/component-studio.js` | 645 | 0 |

## Modified files (7)

| File | + | - |
|---|---:|---:|
| `en/static/css/header-hero.css` | 52 | 0 |
| `en/static/js/component-admin.js` | 3 | 0 |
| `en/templates/layout/base.html` | 2 | 0 |
| `en/templates/pages/admin/components.html` | 20 | 2 |
| `en/test/component-hero.test.js` | 2 | 1 |
| `en/worker/api.js` | 45 | 8 |
| `en/worker/component-engine.js` | 9 | 0 |

## Install on the phone (Termux), pick ONE

Run these from inside the repo, not from `~`.

### A. Script
```bash
cd ~/lummet/lummet-tenant && git status --short
unzip -p ~/storage/downloads/lummet-tenant-v15-component-studio-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh
bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v15-component-studio-full.zip ~/lummet/lummet-tenant
bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v15-component-studio-full.zip ~/lummet/lummet-tenant
```
### B. Patch
```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v15-component-studio.patch
git apply ~/storage/downloads/lummet-tenant-v15-component-studio.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/component-studio.test.js test/component-hero.test.js test/component-page-types.test.js test/component-engine-banners.test.js 2>&1 | tail -12
cd ..
git add -A && git status --short && git diff --cached --stat | tail -1
git commit -m "Tenant: Component Studio, visual editing and pickers for all component types"
git push origin main
cd en && npx wrangler deploy 2>&1 | tail -15
```
Look for `fail 0` (expect `pass 77`). Send the last lines of the deploy.

Then open Dashboard > Components, choose type "Content Grid", press "Search and add", add a few casinos, and watch the preview. Assign it to a page as usual.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy 2>&1 | tail -15
```
Components of the new types stay saved; they render nothing until the code is back.
