# Newsroom database layer (worker/database/newsroom.js, worker/database/newsroom/)

`newsroom.js` (704 lines) is now a facade that re-exports 59 names from four parts. Controllers, the sitemap and the tests still import `worker/database/newsroom.js`.

| Part | Lines | Holds |
|---|---:|---|
| `newsroom/base.js` | 86 | Vocabularies, feature-flag check, text and slug helpers, URL validation, and the shared `LIVE` SQL fragment (published and not scheduled later). |
| `newsroom/editorial.js` | 256 | Sources, revisions, corrections, workflow, fact check, taxonomy sections. Admin-side, permission-checked. |
| `newsroom/public.js` | 145 | Public loaders (explicit columns), flags cache, related articles, section pages. |
| `newsroom/discovery.js` | 228 | Slug redirects, regions and countries (cached), collection pages, topic/entity/series lookups, discovery on the article page, sitemap entries. |

Imports go one way: `base` <- `public`, `base` <- `discovery`, and `editorial` and `public` use `discovery` for country lookups. There is no cycle (a test checks it). One constant moved: `LIVE` used to sit in the middle of the file and is now in `base.js` so every part can share it.
