# Research controller (worker/controllers/research.js, worker/controllers/research/)

`research.js` (668 lines) is now a facade over three parts. `worker/controllers.js` still re-exports from it, so nothing that imports the controller changed.

| Part | Lines | Holds |
|---|---:|---|
| `research/sections.js` | 328 | Renders a research item's content sections (text, statistic, timeline, table, citation, FAQ, links, reference, dataset table), source footnotes, claims, related items, type labels. |
| `research/directory.js` | 90 | Sort options and card markup for the hub and the type lists, filter options, component variables. |
| `research/pages.js` | 251 | The four page controllers: `renderSiteSearch`, `renderResearchHub`, `renderResearchTypeList`, `renderResearchItem`. |

Dependencies run one way: `sections` <- `directory` <- `pages`. `test/research-controller-structure.test.js` checks it.
