# Release: YouTube and Vimeo in the hero (tenant v11)

Built on tenant v10 (commit `e64d1f5`). Control plane untouched.

## What changed for users

Both ways, as requested. Everything is off by default; v10 settings and the default hero are unchanged.

**A. Click to play (pop-up player)**
- New slide type **YouTube / Vimeo** with "How it plays: Opens in a pop-up when clicked". The slide shows your poster picture and a "Watch video" pill.
- New hero button **Watch video** (switch, button text, video link) that opens the same pop-up.
- Nothing from YouTube or Vimeo loads until a visitor clicks. The player closes with the X, Escape or a click outside, and keyboard focus returns to the button.

**B. Silent looping video behind the text**
- Same slide type with "How it plays: Plays silently behind the text".
- Safeguards: it starts only after the page has finished loading; it never loads for reduced-motion or data-saver visitors; on phones it stays on the poster picture unless you switch on **Play online background videos on phones**; it is removed when the slide changes, the tab is hidden, the hero scrolls out of view, the pop-up opens, or the visitor presses pause.
- It moves on after "seconds per picture", like a picture slide.

**Safety**
- Paste any normal link (watch, youtu.be, shorts, embed, vimeo.com, player.vimeo.com). Only the provider and video id are stored, and the player address is built from a fixed template (`youtube-nocookie.com`, `player.vimeo.com` with Do Not Track). Channel, playlist, profile and look-alike links are refused on screen and again on the server.
- The page source never contains an iframe; the script creates one, and only for the two allowed player addresses.

**Privacy note.** The pop-up contacts YouTube or Vimeo only after a click. A background video contacts them on every visit that plays it. The site has no cookie-consent banner today, so use the pop-up unless you have decided otherwise.

Details: `docs/HEADER_HERO.md`, "YouTube and Vimeo".

## Numbers

Counted with `git diff --numstat` against v10, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **7** | **450** | **30** |
| New files | 0 | 0 | 0 |
| Modified files | 7 | 450 | 30 |
| Deleted files | 0 | 0 | 0 |

Tests: 865 pass serially (`npm test -- --test-concurrency=1`); 8 are new, all in `en/test/header-hero.test.js` (link parsing with look-alike and hostile links, fixed player addresses, canonical storage, markup with no iframe, the Watch button, script allow-list). The pop-up (open, Escape, backdrop, focus return), background video (desktop, phone, reduced motion, removal on slide change and pause) and the admin editor were also run in a real browser at 1280 px and 390 px, using stand-in player pages. The real YouTube and Vimeo players could not be reached from the build environment, so please try one of each on your site.

## Migrations

**None.** New keys in the existing `settings` table on first save: `site_hero_watch_enabled`, `site_hero_watch_text`, `site_hero_watch_url`, `site_hero_media_embed_mobile`. Slides gain two optional values (`type: "embed"`, `play`) inside the existing `site_hero_slides` JSON. No secret or binding.

## Deleted files

None. The few removed lines are rewritten in place.

## New files (0)

| File | + | - |
|---|---:|---:|
| _none_ | 0 | 0 |

## Modified files (7)

| File | + | - |
|---|---:|---:|
| `docs/HEADER_HERO.md` | 14 | 0 |
| `en/static/css/header-hero.css` | 35 | 0 |
| `en/static/js/header-hero-admin.js` | 65 | 17 |
| `en/static/js/hero-media.js` | 131 | 4 |
| `en/templates/pages/admin/header-hero.html` | 2 | 2 |
| `en/test/header-hero.test.js` | 89 | 1 |
| `en/worker/header-hero.js` | 114 | 6 |

## Install on the phone (Termux), pick ONE

Run these from inside the repo, not from `~`.

### A. Script
```bash
cd ~/lummet/lummet-tenant && git status --short
unzip -p ~/storage/downloads/lummet-tenant-v11-online-video-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh
bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v11-online-video-full.zip ~/lummet/lummet-tenant
bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v11-online-video-full.zip ~/lummet/lummet-tenant
```
### B. Patch
```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v11-online-video.patch
git apply ~/storage/downloads/lummet-tenant-v11-online-video.patch
```

## Test, commit, deploy

```bash
cd ~/lummet/lummet-tenant/en
node --test test/header-hero.test.js test/media-range.test.js test/dashboard-shell.test.js 2>&1 | tail -12
cd ..
git add -A && git status --short && git diff --cached --stat | tail -1
git commit -m "Tenant: YouTube and Vimeo in the hero (pop-up and background)"
git push origin main
cd en && npx wrangler deploy
```
Look for `pass 92` and `fail 0` in the test output (92 = 84 + 8 new). If the deploy prints errors, send the last lines.

Then in Header & Hero: add a slide of type YouTube / Vimeo, or switch on the Watch video button, save, reload the homepage and click it. Try the background variant on a computer and on a phone.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy
```
Saved values stay in `settings`; v10 ignores embed slides it does not understand.
