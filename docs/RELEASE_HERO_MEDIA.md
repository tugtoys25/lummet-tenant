# Release: hero pictures, slideshow and video (tenant v10)

Built on tenant v9 (commit `247f97a`). Control plane untouched.

## What changed for users

Two new cards on **Site Structure → Header & Hero**, both **off by default**. While they are off the hero is byte-for-byte what v9 produced (a test checks this).

**Hero pictures and video** (behind the text, up to 6 slides)
- Pictures, short videos, or a mix. Choose files from the Media library or paste an address.
- One slide stays fixed. Two or more slide on their own (fade or slide) or by arrows, dots, keyboard and swipe.
- Picture motion: Still, Slow zoom, Slow pan. 3 to 20 seconds per picture. A video plays to the end, then the show moves on.
- Any slide can have a link, which makes the empty part of the hero clickable (the text and buttons keep working).
- Pause button, pause on hover (optional), and automatic pause when the tab is hidden or the hero is off screen.
- Reduced-motion and data-saver visitors get no moving pictures, and videos stay on their poster picture.

**Pictures inside the hero** (up to 4)
- Fixed or clickable images with an optional caption, under the text or beside it (wide screens), in three sizes.

**Also in this release**
- `/media/...` files now answer HTTP Range requests (206 Partial Content). Safari and iPhone will not play a video from a server without this, and it also lets visitors seek. Requests without a Range header behave as before, apart from one added `Accept-Ranges` header.
- The preview shows the first slide, the controls, the picture motion and the pictures inside the hero (the live site also slides on its own).
- Presets keep your slides and pictures; they only change the look.

Tips and limits are in `docs/HEADER_HERO.md`, section "Hero pictures and video".

## Numbers

Counted with `git diff --numstat` against v9, excluding the three generated files.

| | Files | Lines added | Lines deleted |
|---|---:|---:|---:|
| **Total** | **10** | **1014** | **13** |
| New files | 2 | 258 | 0 |
| Modified files | 8 | 756 | 13 |
| Deleted files | 0 | 0 | 0 |

Tests: 857 pass serially (`npm test -- --test-concurrency=1`); 21 are new (14 in `en/test/header-hero.test.js`, 7 in `en/test/media-range.test.js`). Layout, the slideshow, video playback, reduced motion and the admin editor were also checked in a real browser at 1280 px and 390 px.

## Migrations

**None.** New keys are stored in the existing `settings` table on first save: `site_hero_media_enabled`, `site_hero_slides`, `site_hero_media_autoplay`, `site_hero_media_interval`, `site_hero_media_transition`, `site_hero_media_motion`, `site_hero_media_arrows`, `site_hero_media_dots`, `site_hero_media_pause_hover`, `site_hero_cards_enabled`, `site_hero_cards`, `site_hero_cards_position`, `site_hero_cards_size`. No new secret or binding.

## Deleted files

None. The few removed lines are rewritten in place (the hero builder, the class list, one media-serving function, one test lookup).

## New files (2)

| File | + | - |
|---|---:|---:|
| `en/static/js/hero-media.js` | 180 | 0 |
| `en/test/media-range.test.js` | 78 | 0 |

## Modified files (8)

| File | + | - |
|---|---:|---:|
| `docs/HEADER_HERO.md` | 22 | 0 |
| `en/static/css/header-hero.css` | 130 | 0 |
| `en/static/js/header-hero-admin.js` | 244 | 3 |
| `en/templates/layout/base.html` | 1 | 0 |
| `en/templates/pages/admin/header-hero.html` | 3 | 1 |
| `en/test/header-hero.test.js` | 135 | 3 |
| `en/worker/header-hero.js` | 167 | 6 |
| `en/worker/media-upload.js` | 54 | 0 |

## Install on the phone (Termux), pick ONE

Run these from inside the repo, not from `~`.

### A. Script
```bash
cd ~/lummet/lummet-tenant && git status --short
unzip -p ~/storage/downloads/lummet-tenant-v10-hero-media-full.zip lummet-tenant/docs/integration/integrate.sh > ~/integrate.sh
bash ~/integrate.sh check ~/storage/downloads/lummet-tenant-v10-hero-media-full.zip ~/lummet/lummet-tenant
bash ~/integrate.sh apply ~/storage/downloads/lummet-tenant-v10-hero-media-full.zip ~/lummet/lummet-tenant
```
### B. Patch
```bash
cd ~/lummet/lummet-tenant && git status --short
git apply --check ~/storage/downloads/lummet-tenant-v10-hero-media.patch
git apply ~/storage/downloads/lummet-tenant-v10-hero-media.patch
```

## Test, commit, deploy

The whole suite can be killed by Android for memory. Run the files that matter, then the rest one by one:

```bash
cd ~/lummet/lummet-tenant/en
node --test test/header-hero.test.js test/media-range.test.js test/dashboard-shell.test.js 2>&1 | grep -E "^# (tests|pass|fail)"
for f in test/*.test.js; do node --test "$f" >/dev/null 2>&1 || echo "FAIL $f"; done; echo finished
cd ..
git add -A && git status --short && git diff --cached --stat | tail -1
git commit -m "Tenant: hero slideshow, video and pictures; media byte-range support"
git push origin main
cd en && npx wrangler deploy
```

Then open `/en/dashboard/header-hero`, open "Hero pictures and video", add two pictures, switch it on, Save, and reload the homepage. For video, test on an iPhone too.

## Rollback

```bash
cd ~/lummet/lummet-tenant && git revert --no-edit HEAD && git push origin main && cd en && npx wrangler deploy
```
Saved slides stay in `settings` and the v9 code ignores them.
