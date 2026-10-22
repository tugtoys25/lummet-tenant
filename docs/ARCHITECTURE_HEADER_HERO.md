# Header and hero settings: module layout

`worker/header-hero.js` is a facade that re-exports the same 27 names as before, so every importer is unchanged.

| Part | Content | Depends on |
|---|---|---|
| `header-hero/schema.js` | Field types, limits, font stacks, the `FIELDS` table, `HEADER_HERO_KEYS` | nothing |
| `header-hero/clean.js` | Validators (text, link, image, colour, video, slides, cards), `normalizeOne`, `parseHeaderHero`, `defaultHeaderHero`, `sanitizeHeaderHeroInput` | `schema` |
| `header-hero/render.js` | Template variables, header and hero classes, hero HTML (media, controls, cards), admin defaults, `jsonForScript` | `schema`, `clean` |

Rule: dependencies point one way, `schema` <- `clean` <- `render`. `test/header-hero-structure.test.js` checks it.
