# Live banner slider / home banner

Upgrades the **Slider** template of Dashboard > Banner Management > Live banners into an enterprise-grade, multi-picture, clickable slider that works as the home banner.

## For editors
- **New home banner (slider)** button on the Live banners list, or pick the template *Slider / home banner* and press **Use as home banner** (full width under the header, home page only, no close button, 3:1 desktop / 16:9 phone). **Show on every page** is the same without the home-page rule.
- Up to **10 slides**. Each slide: desktop picture, optional phone picture, alt text, headline, text, badge, link, button text, new-tab, *paid link* (adds `rel="sponsored"`), text position, own seconds-on-screen, show-from / show-until, and its own views / clicks / CTR.
- Slider settings: seconds per slide, animation (fade, slide, zoom, Ken Burns), animation length, shape (21:9, 3:1, 4:1, 2:1, 16:9, 3:2, 4:3, 1:1) and a separate phone shape, fit, text shade, arrows, dots or bars, progress bar, counter, pause-on-hover, loop, swipe, keyboard, optional "Ad" label.
- Every slide with a link is clickable as a whole; slides without one use the banner-wide link.

## Behaviour (follows the W3C carousel pattern and web.dev carousel guidance)
- Pauses while the pointer is over it, while keyboard focus is inside, when less than 40 % is on screen and when the tab is hidden. A visible play/pause button is first in reading order. `prefers-reduced-motion`: no automatic rotation, no play button.
- Screen readers: `region` + `aria-roledescription` carousel/slide, "N of M" labels, live region is off while rotating and polite when the visitor drives it. Inactive slides are `visibility:hidden` (not focusable).
- Performance: the first picture of an above-the-fold banner is eager with `fetchpriority="high"`, the others lazy with low priority; the stage reserves its height with `aspect-ratio`; only `transform`/`opacity` animate, so CLS stays 0. Slides are in the HTML (first one visible without JavaScript).
- Touch: swipe (touch/pen only), `touch-action: pan-y`.

## Files
- New: `worker/live-banners/{tpl-slider,validate-slider,validate-util}.js`, `static/js/live-banners-slider.js`, `static/js/live-banner-admin/{07-slider,08-slides}.js`, `css-src/main/15-live-banner-slider.css`, `css-src/dashboard/16-live-banner-slides-admin.css`, `migrations/0039_live_banner_slide_stats.sql`, `test/live-banners-slider.test.js`.
- Changed: `limits.js`, `validate.js` (helpers moved to `validate-util.js`), `load.js` (slide fields, per-slide schedule), `render.js` (loads the slider script only when a slider is present), `stats.js` + `database/live-banners.js` (per-slide beacons), `api/routes/live-banners.js` (`slide_stats` in *get*, preview shows scheduled slides), `static/js/live-banners.js` (exposes `window.LiveBanners.track`), admin `02/03/06` scripts, `banners.html`, `base.html`, built CSS and `asset-version.js`.

## Compatibility and data
- Existing sliders keep working (every new field is optional; defaults reproduce a 2:1 fading slider that rotates every 6 s).
- **Migration 0039** adds `live_banner_slide_stats` (one row per banner, slide, day). Run the usual tenant migration after deploying.
- Slide beacons (`{id,type,s}`) are counted for that slide only, and only for real slides of live banners. Banner totals are unchanged.
- Per-slide schedule is applied on the server (60 s cache) and re-checked in the browser because pages can be cached.

## Evidence
`npm test`: 187 files, 2841 tests, 0 failed (20 new). `build-css --check`, `build-public-css --check`, `asset-version --check` clean.
Also driven in headless Chromium (42 checks): first-slide paint, autoplay timing, hover / user / keyboard pause, play-pause label, arrows, dots, wrap-around, Home/End, per-slide click and view beacons, CLS = 0 over three transitions, reduced motion, phone shape + phone picture, touch swipe, browser-side expiry, fade / zoom / Ken Burns.
NOT verified: the admin editor screens in a browser (syntax-checked only), real Media-picker flow, Safari/Firefox.
