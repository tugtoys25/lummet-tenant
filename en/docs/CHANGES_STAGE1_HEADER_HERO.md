# Stage 1: header types and hero types

Adds 5 new header types and 7 new hero types, plus 12 ready-made templates that use them.
All CSS only. Defaults add no CSS, so a site nobody changed renders exactly as before.

## New settings
- `theme_header_layout` now also accepts: `split`, `twoline`, `floating`, `sidebar`, `line` (existing: `default`, `stacked`).
- `theme_hero_layout` (new, default `default`): `split`, `card`, `framed`, `diagonal`, `spotlight`, `cinematic`, `banner`.

## Safety
- Header types apply from 769px up (`sidebar` from 1025px up). Phones and tablets keep the normal logo and menu button.
- Nothing is hidden; no markup, link or content is changed (checked by test/header-hero-layouts.test.js).
- Unknown values fall back to the default. Output for all pre-existing settings is byte-identical.
- No migration. No database change. Existing designs and templates keep their ids and values.

## Files
- worker/site-settings/theme-layouts.js: the CSS for each type
- worker/site-settings/defaults.js, get-site-settings.js: read `theme_hero_layout`
- worker/site-profile/settings-groups.js: the two settings in Layout
- worker/site-profile/design-packs.js: `theme_hero_layout` is now a template key; 12 new templates (42 in total)
- static/js/admin/configuration-look.js: template summary names the new types
- worker/asset-version.js: regenerated (`node scripts/asset-version.mjs`)
- test/header-hero-layouts.test.js: new tests
