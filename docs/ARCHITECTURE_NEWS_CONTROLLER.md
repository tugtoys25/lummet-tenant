# News controller (worker/controllers/news.js, worker/controllers/news/)

`news.js` (683 lines) is now a three-line facade over three parts. `worker/controllers.js` still re-exports from it, so nothing that imports the controller changed.

| Part | Lines | Holds |
|---|---:|---|
| `news/landing.js` | 204 | Section, region, country, taxonomy (topic, entity, series) pages and the search page; `renderNewsTaxonomyPage`. |
| `news/article.js` | 279 | `renderNews`: one article page (flags, sources, corrections, related, ads, JSON-LD). |
| `news/list.js` | 212 | The news home (`renderNewsHome`) and `renderNewsList`. |

`article` and `list` import from `landing` only; there is no cycle. `test/support/controllers-source.js` now also reads one level of sub-folders, so source-inspection tests see the parts.
