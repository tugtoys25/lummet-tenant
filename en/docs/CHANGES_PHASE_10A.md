# Phase 10 partial A (tenant): master switch, accessibility, help

NOT production ready. Test suites were NOT run after these changes (see NOTES_PHASE_10_PARTIAL_A.md).

## Master switch (Phase 10 item 6)
- `worker/site-profile/system-flag.js`: env `CONFIGURABLE_PLATFORM` (off/on, 0/1, false/true, disabled/enabled, no/yes) wins over settings key `configurable_platform`. Missing, empty or unknown = ON (today's behaviour). Unreadable settings = ON.
- OFF: `loadProfile` returns the Full platform (no gating); Configuration nav entry hidden; Configuration page redirects to `/en/dashboard`; welcome panel and next steps empty; every configuration write refused 403 `config_system_off` (site-profile POST/settings/setup complete, `/api/v1/config/*` writes except preview, `/api/v1/config/transfer/*` writes except plan). Nothing stored is deleted or changed.
- `GET/PUT /api/v1/site-profile/system` (GET staff, PUT admin; PUT is refused 409 `flag_set_by_environment` when the env var decides).
- Resolver cost: one D1 query on a cache miss (profile and switch in a single `IN (?, ?)` query), none on a cache hit, none when env says off. Cache entry is now `{p, off}`; old bare entries are read as ON.
- Super API v17: `GET /en/api/super/site-system`, `system` object in `GET site-setup`, capability `site_system`; `POST site-setup` answers 409 `config_system_off` while off.

## Accessibility (item 3), code only
Labels on three selects, radiogroup for presets, headings that take focus (publish, version, welcome), Escape closes publish/version panels and focus returns to the opener, focus kept on the same control when the lists redraw, `role=alert` region for errors, `aria-live` status lines, table captions and column scopes, visible focus styles, reduced-motion rule, welcome-panel text contrast. No real browser or screen reader was used.

## Help (item 5, in-app part)
"How setup works" section on the Configuration screen.

## Operator notes
Disable: set `CONFIGURABLE_PLATFORM=off` as a Worker var, or `PUT /en/api/v1/site-profile/system {"enabled":false}` (admin). Re-enable the same way. Stored configuration is kept and comes back exactly.
