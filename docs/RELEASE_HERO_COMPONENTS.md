# Release: hero components with the homepage hero's abilities (tenant v12)

Built on tenant v11 (commit `0c689d0`). Control plane untouched.

## What changed for users

A **Hero Section** component (Dashboard > Components) can now do everything the homepage hero can. Everything is opt-in: existing hero components look exactly as before.

- **Hero options** panel in Components when the type is Hero Section, with the same sections as Header & Hero: text and buttons (label, highlights, two buttons, Watch video), layout and colours (alignment, height, text colour, title colour, fonts, background colour or picture, overlay), pictures and video behind the text (slider, video files, YouTube / Vimeo as pop-up or silent background, arrows, dots, fade or slide, zoom or pan), and pictures inside the hero (fixed or clickable).
- A live **preview** (desktop or phone) built by the server, so it matches the real page.
- A **Use the advanced hero** switch. Off keeps the original simple hero (headline, text, one button, background picture) untouched. On moves it to the new layout and carries over its link, button text, picture and new-tab values.
- As many hero components as you like on a page. Each slideshow moves independently, and one below the fold waits until it is on screen. The first picture loads lazily unless the component is at the **top** injection point.
- The **Title** is the headline and the **Content** is the subtitle (plain text in the advanced hero).
- Saving a hero now cleans its settings the same way the homepage does (bad links, colours, fonts and videos are dropped) and refuses text that is not valid JSON, with a plain message.

Details: `docs/HEADER_HERO.md`, "Hero components".

## Numbers

Counted with `git diff --numstat` against v10, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **11** | **831** | **14** |
| New files | 3 | 692 | 0 |
| Modified files | 8 | 139 | 14 |
| Deleted files | 0 | 0 | 0 |

Tests: 890 pass serially (`npm test -- --test-concurrency=1`); 22 are new (all in `en/test/component-hero.test.js`; the existing hero suites still pass byte-for-byte, including the homepage hero snapshot). The admin panel (legacy load, switch on, carried-over values, fields, slides and pictures, preview, phone preview, blocked save, new hero, other types) and the public page (a homepage hero and a hero component together: independent slideshows, off-screen pause, lazy video, pop-up open and Escape) were run in a real browser at 1280 px and 390 px. The real YouTube and Vimeo players still need one try on your site.

## Migrations

**None.** Options live in the component's existing `settings_json`. No secret or binding.

## Deleted files

None. A few lines of `heroHtml` were rewritten in place so the homepage and components share one builder; the homepage output is byte-identical (tested).

## New files (3)

| File | + | - |
|---|---:|---:|
| `en/static/js/component-hero-admin.js` | 393 | 0 |
| `en/test/component-hero.test.js` | 165 | 0 |
| `en/worker/component-hero.js` | 134 | 0 |

## Modified files (8)

| File | + | - |
|---|---:|---:|
| `docs/HEADER_HERO.md` | 23 | 0 |
| `en/static/css/header-hero.css` | 27 | 0 |
| `en/static/js/component-admin.js` | 2 | 1 |
| `en/templates/layout/base.html` | 1 | 0 |
| `en/templates/pages/admin/components.html` | 20 | 1 |
| `en/worker/api.js` | 29 | 0 |
| `en/worker/component-engine.js` | 10 | 0 |
| `en/worker/header-hero.js` | 27 | 12 |

## Install on the phone (Termux), pick ONE

Run these from inside the repo, not from `~`.

### A. Script
```bash
cd ~/lummet/lummet-tenant && git status --short
unzip -p ~/storage/downloads/lummet-tenant-v12-hero-components-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh
bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v12-hero-components-full.zip ~/lummet/lummet-tenant
bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v12-hero-components-full.zip ~/lummet/lummet-tenant
```
### B. Patch
```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v12-hero-components.patch
git apply ~/storage/downloads/lummet-tenant-v12-hero-components.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/component-hero.test.js test/header-hero.test.js test/media-range.test.js test/component-engine-banners.test.js 2>&1 | tail -12
cd ..
git add -A && git status --short && git diff --cached --stat | tail -1
git commit -m "Tenant: hero components get the homepage hero abilities"
git push origin main
cd en && npx wrangler deploy
```
Look for `fail 0` in the test output (expect `pass 105`). If the deploy prints errors, send the last lines.

Then open Dashboard > Components, edit an existing Hero Section (it should still show the simple hero), and create a new one: pick type Hero Section, add a picture slide and a YouTube slide, Create, assign it to a page, and open the page.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy
```
Saved values stay in `settings`; the new keys in a component are ignored by v11, which shows the simple hero.
