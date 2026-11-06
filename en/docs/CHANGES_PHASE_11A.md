# Phase 11A: sportsbook / partners / custom presets (T1)

## The problem
Two gates decide whether sportsbook, affiliate partner and custom content pages are reachable:
the site profile (`content.sportsbook`, `content.partners`, `content.custom`) and the older
`content_types_enabled` setting (migration 0051, default: all three OFF). A page is served only when both allow it.
Applying the "Sportsbook listing" preset set the first and never the second, so its pages still answered 404 and were
missing from the sitemap until someone also flipped the older setting.

## The change
- New `worker/site-profile/content-sync.js`. When a profile is written whose preset is a named preset other than
  "full" and whose content module is on, the older setting is switched ON for the content types the profile keeps.
- It never switches the older setting off and never runs for "Full platform", so existing sites behave as before.
- Wired into the one shared apply step (publish, rollback and import all use it, same batch as the profile write),
  the direct profile save (`POST /api/v1/site-profile`) and the unversioned first-setup fallback.
- The in-isolate content-type cache is cleared after a profile change.
- New test: `test/content-types-profile-sync.test.js` (8 cases).

## Behaviour to know
- A site that already has the sportsbook preset live is NOT repaired by deploying this. Re-publish the configuration
  (or switch Sportsbook on once in the content-types settings) to fix it.
- Switching from the sportsbook preset back to Full leaves the older setting ON, so Full then shows sportsbook.
  Turn it off in the content-types settings if that is not wanted. This was chosen over silently switching it off.
- Removed-page mode (404/410/301) is unchanged; the profile gate still hides what the profile switches off.

## NOT VERIFIED
Ran only: `content-types-profile-sync`, `site-profile-versions`, `site-setup`, `site-profile`,
`site-profile-transfer-api`, `site-profile-transfer-store`, `site-profile-manifest` (204 tests, all passing).
The full tenant suite, real D1 (the merge uses SQLite `json_set`, which D1 supports but was only run on the local
test shim), a request-level check that `/en/sportsbook` and the sitemap now return 200 after publishing the preset,
and the control plane were not run or touched.
