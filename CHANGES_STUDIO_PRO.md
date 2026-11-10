# Design Studio (Libraries 2-5)

New, isolated module `en/worker/studio-pro/`. Library 1 (existing Design and Templates tabs, design-packs.js, header-hero/*,
configuration.html) is byte-for-byte unchanged (verified with `git status`; test/studio-pro.test.js also asserts it).

* Library 2 themes (22, ids `dsp-*`), Library 3 headers (25), Library 4 heroes (30), Library 5 sections (17 kinds, 35 variants), 16 shapes, 9 surfaces.
* Settings: new `prostudio_*` keys in the existing `settings` table. No migration. Missing key = studio off = site renders exactly as before.
* Admin: /en/dashboard/studio-pro/{themes,headers,heroes,sections}, new "Design Studio" sidebar group.
* API: /en/api/v1/studio-pro/{state,preview,apply,revert,off}. Preview = editors, apply = admins, cross-site refused, previous design snapshotted for "Return to previous".
* Public hook: `...proStudioOverrides(site)` after the untouched Library 1 spread in render.js; returns `{}` when off.
* Shared files touched (additive only): api/routes/index.js, routing/dashboard.js, app/routes/dashboard-content.js, controllers.js,
  controllers/dashboard.js, render.js, get-site-settings.js, site-profile/{registry,ownership}.js, admin-nav.html, asset-version.js,
  plus test updates (dashboard-shell list, regenerated preset snapshots = the 4 new sidebar links only).
