# Release: header and hero colours and fonts (tenant v9)

Built on tenant v8 (Header & Hero manager, commit `7c450f4`). Control plane untouched.

## What changed for users

On **Site Structure → Header & Hero**:

- **Header text colour**: brand name, menu links, search box and Login/Dashboard/Logout buttons. A colour picker plus typed value, with a Reset button and a non-blocking low-contrast warning against the header colour.
- **Header font**: eight built-in choices (Site default, System, Modern sans, Rounded, Serif, Elegant serif, Bold display, Monospace).
- **Hero custom text colour**, **hero title colour**, **title font** and **body font**.
- The header background colour already existed and is unchanged.
- Fonts are system stacks: nothing is downloaded, so pages stay fast and nothing third-party is contacted.
- Everything left on Default adds no CSS, so existing sites look exactly as before.
- The live preview shows the new colours and fonts as you type.
- On the live site, a custom header text colour also restyles the search box so it stays readable on a light header, and the phone menu uses the header colour as its background.

Details are in `docs/HEADER_HERO.md`, section "Colours and fonts".

## Numbers

Counted with `git diff --numstat` against v8, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **6** | **230** | **18** |
| New files | 0 | 0 | 0 |
| Modified files | 6 | 230 | 18 |
| Deleted files | 0 | 0 | 0 |

Tests: 836 pass serially (`npm test -- --test-concurrency=1`), 6 new in `en/test/header-hero.test.js` and 1 existing check widened to cover select lists.

## Migrations

**None.** Six new keys are stored in the existing `settings` table on first save: `site_header_text_color`, `site_header_font`, `site_hero_text_color`, `site_hero_title_color`, `site_hero_heading_font`, `site_hero_body_font`. No new secret or binding.

## Deleted files

None. The only removed lines are the few that are rewritten in place (class lists, the colour row layout, one test lookup).

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

## Modified files (6)

| File | + | - |
|---|---:|---:|
| `docs/HEADER_HERO.md` | 15 | 3 |
| `en/static/css/header-hero.css` | 42 | 3 |
| `en/static/js/header-hero-admin.js` | 56 | 3 |
| `en/templates/pages/admin/header-hero.html` | 2 | 2 |
| `en/test/header-hero.test.js` | 77 | 2 |
| `en/worker/header-hero.js` | 38 | 5 |

## Install on the phone (Termux), pick ONE

Run these from inside the repo, not from `~`.

### A. Script
```bash
cd ~/lummet/lummet-tenant && git status --short
unzip -p ~/storage/downloads/lummet-tenant-v9-header-colors-fonts-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh
bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v9-header-colors-fonts-full.zip ~/lummet/lummet-tenant
bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v9-header-colors-fonts-full.zip ~/lummet/lummet-tenant
```
### B. Patch
```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v9-header-colors-fonts.patch
git apply ~/storage/downloads/lummet-tenant-v9-header-colors-fonts.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
npm test -- --test-concurrency=1 2>&1 | tail -12
cd ..
git add -A && git status --short && git diff --cached --stat | tail -1
git commit -m "Tenant: header and hero colours and fonts"
git push origin main
cd en && npx wrangler deploy
```

Then open `/en/dashboard/header-hero`, set a header text colour and a hero title colour, check the preview, Save, and reload the homepage.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy
```
Saved values stay in `settings` and the v8 code ignores them.
