# Phase 11H: fix for the release test failure after Phase 11F

The release workflow for Phase 11F failed on Node 22 and Node 24 with one failing test in 2294:
`test/component-studio.test.js` ("is a tab bar pinned under the dashboard bars ... and every section linked").
The test reads `templates/pages/admin/settings.html` and matched `<a href="#homepage-content">` exactly. Phase 11F added
`data-cap="features.homepageBuilder"` to that link, so the match failed. The link is still there; the test was too strict.

## Change
- `test/component-studio.test.js`: the anchor pattern now allows other attributes (`<a href="#id"[^>]*>`). No production code changed.

## Why it was missed in 11F
I searched for tests that mention the changed markup by string and read a list of eight; this file was not on it. The full suite was
not run by me (your rule), so the release run found it.

## Tests run
`component-studio` 43/43 after the change. Also run once each because they reference files 11F/11G changed: component-page-types 30,
component-hero 22, component-engine-banners 5, instant-pages 10, header-hero 71, routes-structure 4, template-includes 7,
settings-ux 14, dashboard-search 52, config-a11y-dom 43, config-security-hardening 23,
generic-content-engine-geo-related-analytics 28, provider-adapters 17: all pass.

## NOT VERIFIED
The full suite was not run here. The release run for Phase 11G (42169642444) was not seen; it contains the same failing test,
so it is expected to fail the same way until this fix is merged.
