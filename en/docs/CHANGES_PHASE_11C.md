# Phase 11C: dashboard stats and analytics follow the capabilities (T4)

## Why T4 and not T3
T3 (missing feature switches) is marked DECISION in the Phase 11 prompt: the owner has to choose which switches
become real and what each preset does before any code. That decision has not been made, so nothing of T3 was built.
Open DECISION for T3 is listed at the end.

## What changed
- New `worker/site-profile/cap-blocks.js`: a small tag-aware pruner. ANY element carrying `data-cap="<capability>"`
  (cards, `admin-section`, table rows, `<option>`s, void elements) is removed when that capability is off.
  `data-cap="a|b"` (or `a,b`) keeps the element while either is on.
  - Handles nested same-name tags, attribute order, single or double quotes, upper case tags, `>` inside attribute values.
  - `<option>` needs no closing tag (ends at the next option, `</option>`, `</optgroup>` or `</select>`).
  - Comments, `<script>` and `<style>` bodies are never read or changed.
  - Fail open: an element whose end cannot be found is left in place; any error returns the page unchanged.
- `pruneCapBlocks()` in `profile.js` now uses it (the old regex only matched `<div class="stat-card" ...>`). The three existing
  stat cards behave as before.
- `registry.js`: `ANALYTICS_DIMENSION_CAP` and `REPORT_TYPE_CAP` map each module-specific dimension / report type to its
  capability. `/api/v1/stats/top-casinos` is owned by `casino.go` (so the admin API gate answers `feature_disabled`).
- Overview: "Top Casinos by Clicks" follows `casino.go`; "Clicks by Country" follows `casino.go` or `content.go`.
- Analytics: dimension select, alert scope select, "Tracking Link Health" metric and "Health Failure" threshold are tagged.
- Reports: report type select (casino, offer, affiliate, partner, program, account, tracking link) and the cohort
  "Group by" options (casino, campaign) are tagged.
- Admin API, switched-off module = empty or refused, never an error:
  - `GET /api/v1/analytics/overview` and `/timeseries` for a dimension of an off module return `rows: []` / `series: []` (200).
  - `GET /api/v1/reports/list` hides saved reports of an off type (not deleted).
  - `GET /api/v1/report/column-options` returns `columns: []`.
  - `POST /api/v1/report/create` and `/report/run` for an off type return the existing `feature_disabled` 404 shape.
- `analytics-admin.js`: the "Performance by ..." heading now starts from the first option that is left. `asset-version.js` regenerated.
- New `test/site-profile-cap-blocks.test.js` (15 tests): parser edge cases, every preset (no tagged block or option of an off
  capability left in Overview, Analytics, Reports; Full platform output byte-identical), news / casino / sportsbook cases,
  the API helpers and the two routes.

## Not done on purpose
- The cards "Views, Clicks, Conversions, Revenue, Commission" on Analytics are generic and stay. Revenue and commission are
  empty on a site without partners; hiding them is a design choice, not a capability rule.
- Saved report SCHEDULES of an off type still run in the cron (`scheduledReports`). Skipping them needs a change in
  `database/reports/scheduling.js`; left out to keep this patch small.
- `/api/v1/stats/countries` is not API-gated (the block is hidden; the endpoint returns a normal list).
- The per-preset snapshot of Overview/Analytics/Reports HTML is T5; here the check is a count of leftover tags per preset.
- Content-dimension analytics (review, news, page) have no UI option today, so nothing was tagged for them. They are mapped
  in `ANALYTICS_DIMENSION_CAP` so a future option can be tagged without new code.

## NOT VERIFIED
Ran only: site-profile-cap-blocks (15, new), site-profile-manifest, site-profile, preset-ids-pinned, site-profile-links,
-rows, -guidance, -settings, -screen, api-structure, config-a11y-dom, perf-assets, js-build, css-build, instant-pages,
dashboard-shell, dashboard-js-structure, analytics-structure, reports-structure, analytics-scoping, reports. All passed
here. Not run: the full suite, a browser check of the three screens, keyboard or screen reader use, real D1, the control
plane. No new capability id was added, so `preset-ids-pinned` needed no change in either repository.

## Open DECISION (T3, not started)
Which of ratings, FAQ blocks, review sections, bookmarks, inquiries, submissions, components, homepage builder and import
tools become real switches, which stay core (media library probably core), and what each preset does. Recommended list is in
`PROMPT_PHASE_11_REMAINING.md`. Comments do not exist as a feature route type; nothing to switch.
