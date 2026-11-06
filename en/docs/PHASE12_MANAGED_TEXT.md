# Phase 12: managed visitor-facing text, sidebar and all countries

Everything visitors read that used to be hard-coded is now a setting in Configuration (Look and feel), seeded with the old wording.

## Where things live
- `worker/site-text/registry.js` is the single list (key, default, label, limits, module it needs). It feeds the runtime (`resolve.js`), the dashboard (`site-profile/settings-groups.js`) and the SQL seed.
- `migrations/0014_seed_site_text.sql` seeds the defaults (INSERT OR IGNORE, safe to run twice). Regenerate with `node scripts/generate-site-text-seed.mjs` after editing the registry (`--check` verifies).
- `migrations/0015_seed_countries.sql` seeds 250 countries as unpublished drafts. Regenerate with `node scripts/generate-countries-seed.mjs`.

## Dashboard tabs
- Homepage sections: casinos, reviews, news (on/off, heading, link, count, empty text, load-more).
- Public sidebar: master on/off (off = full-width pages), per block on/off, title, count, position (1-9), empty/loading/error text.
- Landing pages: heading, introduction, search title and description for casinos, reviews, categories, countries, payment methods, affiliates, authors, updates, news, research (plus filter and featured wording), sportsbook, site search (plus result wording), comparison lists, sitemap (plus card text), login, register.
- Account pages: login, register, forgot-password and reset-password wording and search text.
- Item pages: headings and labels on sportsbook and custom-type item pages, plus intro and search text for every custom content type list (`{type}`, `{type_lower}`).
- Search, filters and errors: 404 page, news search box, authors heading, research filter labels and count wording, screen-reader labels (menu, search, scroll to top).
- Page width (inside the existing Layout tab): `Always use the wide desktop layout` plus a width of 960-1920 px. On phones and tablets the page is laid out at that width and scaled to fit, so the desktop design shows; visitors can still pinch to zoom.
- Footer: column titles, newsletter block, disclaimer label, copyright, install label.
Every long tab is split into sub-headings, one per page or block (each field carries a `section` in the registry).
Tokens: `{site}`, `{year}`, `{count}`, `{total}`, `{query}`, `{type}`, `{type_lower}`, `{name}` where the field help says so.

## Behaviour notes
- A per-page SEO entry still wins, then the setting, then the default.
- A module switched off hides its homepage section, sidebar block and its settings.
- Countries are seeded unpublished; publish per country. `/api/v1/public/countries/list` returns published countries only.
- Creating a country that already exists returns a clear "already exists" message (409).
- Geo "everyone" default now allows every country on file (about 250 rules per new item; limit 300).
- The homepage news script no longer overrides the server-rendered list.
- Run migrations 0014 and 0015 on D1 before deploy; the site-settings cache (600 s) may delay changes.
- Page width changes the viewport tag of every public page (`{{viewport_content}}` in layout/base.html). The dashboard itself is not affected.
- Still fixed on purpose: the "Powered by Lummet" credit.
- Dashboard search finds every managed setting by label, key and section (its size guard was raised to 160 KB for this).
