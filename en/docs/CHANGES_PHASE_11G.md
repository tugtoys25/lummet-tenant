# Phase 11G: T3 follow-ups (gaps left open by Phase 11F)

Applies on `main` after Phase 11F. Only "off" is ever stored, so sites with no stored profile are unchanged.

## Closed
- **Script-built ratings and bookmark buttons.** `GET /api/v1/public/casinos/list` and `/casinos/geo` now read the profile (fail open).
  When Ratings is off each casino loses its `rating`; the response carries `hide: ["ratings"|"bookmarks"]` for whatever is off (a
  bookmarks switch whose module, accounts, is off counts as off). With nothing off the response is exactly as before (no `hide` key).
  The sidebar and the search box (`js-src/app/01-..., 03-...`, rebuilt into `static/js/app.js`) and the casino grid component
  (`templates/components/casino_grid.html`) obey `hide`.
- **Rating structured data.** With Ratings off the public pass drops `aggregateRating` and `reviewRating` from JSON-LD (rest of the
  object kept; unparseable JSON-LD and plain scripts untouched). It runs even when "hide links to disabled modules" is off.
- **Re-serialised JSON-LD keeps its escaping.** The site writes JSON-LD with `<`, `>`, `&` escaped (`render/seo.js`). The pass now
  re-escapes the same way, for the new rating strip AND the existing link pruning of JSON-LD, which previously wrote them raw
  (a value such as `</script>` could end the script element early). This fixes a latent issue in code that was already merged.
- **Section navigation with fewer than two links.** After pruning, a `data-sn` bar with fewer than two links left is removed.
  Behaviour change: a review page with review sections off and one FAQ section left no longer shows a one-link bar.
  `site-profile-t3-switches` was updated for this (its old assertion expected the one-link bar).
- **Comparison top picks** rating span is tagged `features.ratings`.
- `static/js/app.js` is generated from `js-src/app`; the parts were edited and rebuilt (`node scripts/build-js.mjs`), asset version regenerated.

## Not changed, by decision
- No scheduled-job work exists for any of the nine switches (no cron task for them), so there is nothing to skip.
- Comments do not exist as a feature in this code base.
- Custom rating-kind comparison fields (admin-defined) are not "the rating" and are left alone.

## Tests run (once each unless noted)
New `site-profile-t3-gaps` 23/23. `site-profile-t3-switches` 73/73, `js-build` 15/15, `perf-assets` 17/17, `dashboard-js-structure` 5/5
(these four were re-run after fixing a generated-file mismatch and a stale assertion; the first runs had 1 and 2 failures).
Also green: `site-profile-links`, `manifest-completeness`, `preset-snapshots`, `config-performance-budget`,
`site-access-gate`, `site-profile-custom-types`, `site-profile-transfer-api`, `site-upgrades`.
NOT run: the full suite (the owner runs it).

## NOT VERIFIED
No browser: the casino grid, sidebar and search box were checked by reading and by a syntax check of the generated script, not by
looking at them. The homepage `display:contents` wrapper from 11F is still unseen in a browser. No real D1 (the endpoint tests use a
stand-in database). No screen reader.
