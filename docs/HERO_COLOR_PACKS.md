# Hero colour packs

**Where:** Dashboard > Configuration > Design > **Hero colours**.

## How the existing "colour bundles" work
- **Ready-made designs** (`DESIGN_PACKS`) replace the whole look: site colours, fonts, shapes, header and hero.
- **Ready-made templates** (`TEMPLATE_PACKS`) replace layout only.
- Header & Hero "Quick styles" reset the whole hero to a preset.
None of these changes the hero colours on their own.

## What a hero colour pack is
`HERO_COLOR_PACKS` in `en/worker/site-profile/design-packs.js`. Each pack sets only five existing settings:
`site_hero_bg_mode`, `site_hero_bg_color`, `site_hero_text_theme`, `site_hero_title_color`, `site_hero_text_color`.
Site colours, fonts, header, hero layout, hero texts, images and slides are never touched, so a pack works on top of any design or template.
"Follow the site colours" clears the five values (the default).

## Behaviour
- Served in `GET /en/api/v1/site-profile/settings` as `heroColors` (additive; `designs` and `templates` unchanged).
- Applied through the existing `POST /en/api/v1/site-profile/settings` (or queued into the draft in draft mode), so validation, history/undo and audit are the same as for any setting.
- Nothing is applied automatically. No feature switch needed: the tab only offers choices.

## Adding a pack
Add one `hero(...)` line to `HERO_COLOR_PACKS`. `test/design-packs.test.js` checks unique ids, only hero colour keys, validator acceptance, and 4.5:1 contrast for title and text on solid backgrounds.
