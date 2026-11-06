# Phase 11F: T3 missing feature switches

Nine new feature switches, enforced through the existing resolver and gates. Applies on `main` (after Phase 11E, `6a1319a`).
Existing sites keep everything: only "off" is ever stored, so deploying changes nothing for a site with no stored profile.

## What changed
- `registry.js`: `features.ratings`, `faqs`, `reviewSections`, `bookmarks`, `inquiries`, `submissions`, `components`, `homepageBuilder`,
  `importTools`. `FEATURES` entries may carry `public` (route types) and `requires` (`"a|b"`: any of these modules must be on).
  Moved out of their old owners (each route type is claimed once): `dashboardInquiries`, `dashboardSubmissions`, `userBookmarks`,
  `userInquiries`, `userSubmitCasino`, `dashboardImportHistory`, `dashboardComponents` (it left CORE_DASHBOARD). Media library stays core.
- `profile.js`: `isEnabled("features.x")` also checks `requires` (bookmarks, inquiries, submissions need accounts; importTools needs
  partners; reviewSections needs reviews or content).
- Admin API refusals by prefix: review-blocks, user/admin bookmark, inquiry, submission, import(s), and the component MANAGEMENT
  endpoints only. Component read, list, preview, pick and hero-preview endpoints stay open (hero editor, link picker, rich editor, ad rules).
- `cap-blocks.js`: a tagged `<script>`/`<style>` is removed as a whole (FAQ JSON-LD); `data-cap-hide` hides instead of removing
  (homepage builder and review editors, so their save scripts still find their fields).
- `links.js` / `app-worker.js`: tagged blocks are pruned by their own pass, independent of "hide links to disabled modules".
- Public blocks tagged `data-cap`: rating rows (casino, item, review, generic review, comparison, card), review FAQ section and FAQ
  component, homepage sections wrapper (`display:contents`), bookmark buttons (both card builders), three user-area links.
- `generic-review-sections.js`: sections and nav entries tagged (FAQ type -> `faqs`, others -> `reviewSections`); FAQ JSON-LD tagged.
- `component-engine.js`: with Components off only `hero` components render (both render paths); fails open.
- Dashboard: homepage builder block and its Settings nav link, casino-review "Sections" tab, generic review block editor and landing
  page section editors are hidden, not removed. `generic-review-edit.js` skips block sync while its editor is hidden.
- `guidance.js`: one `features-need-<module>` issue per missing module, fix = switch the dependent switches off.
- Configuration screen: API meta carries `requires`; `configuration.js` disables a switch whose module is off and says what it needs.
  `worker/asset-version.js` regenerated.
- `ownership.js`: moved prefixes removed (a path claimed twice fails the completeness test).
- Presets (my choice, open to change): every named preset except Full turns off bookmarks, inquiries, submissions, importTools;
  news, research and static also turn off ratings and reviewSections; casino-list and casino-only also turn off reviewSections.
- New `test/site-profile-t3-switches.test.js` (73 tests): per switch, dashboard screen, API refusal, public block, on restores.

## Tests run (once each, on this patch)
site-profile-t3-switches 73/73 (run twice: once to see the failure, once after fixing a wrong needle in the test itself),
manifest-completeness 16/16, site-profile-guidance 10/10, site-profile-manifest 18/18, preset-snapshots 65/65 (no snapshot changed),
preset-ids-pinned 1/1 (tenant) and 1/1 (control plane, no edit), config-performance-budget 14/14, dashboard-js-structure 5/5,
dashboard-shell 14/14, generic-content-engine-remaining-gaps 44/44, generic-review-editor 29/29, geo-manager 20/20,
site-profile-custom-types 15/15, site-profile-links 10/10. `node scripts/asset-version.mjs --check`: current.
NOT run: the full suite (the owner runs it).

## Known gaps
- Ratings and bookmark buttons built by script (casino grid, comparison table components) are not covered; bookmark API calls are refused when off.
- Rating markup in JSON-LD is not covered.
- Ratings, FAQs and the homepage builder have no admin API prefix of their own, so "API refused" does not apply to them.
- If only one review section is left on a page, its navigation bar still shows (the nav is built before pruning).
- Component read, list, preview and pick endpoints stay open on purpose.
- No cron task exists for any of the nine switches, so there is no scheduled work to skip.
- Comments do not exist as a feature in this code base; nothing was invented.

## NOT VERIFIED
No browser check (homepage spacing with the `display:contents` wrapper, hidden editors, Configuration screen), no screen reader,
no real D1, no live site. The full suite was not run on this patch.
