# Super API affiliate handlers (worker/super/handlers-affiliate.js, worker/super/handlers-affiliate/)

`handlers-affiliate.js` (544 lines) is now a facade over four parts. It re-exports the same 40 `handle...` functions, and `worker/super/router.js` still does `import * as ah from "./handlers-affiliate.js"`, so nothing else changed. The helpers (`json`, `ok`, `created`, `fail`, `readJsonBody`, `validateRequired`) are exported from `handlers-affiliate/shared.js` for the parts only; they are not part of the public API. They mirror the ones in `handlers/helpers.js` on purpose, as the original did.

| Part | Lines | Handlers |
|---|---:|---|
| `handlers-affiliate/shared.js` | 27 | Response helpers, body parsing, required-field check |
| `handlers-affiliate/partners.js` | 190 | Partners (5), programs (5), accounts (5) |
| `handlers-affiliate/commercial.js` | 160 | Commercial terms (4: list, get, create, update-rejected), offers (4), tracking links (4) |
| `handlers-affiliate/integrations.js` | 163 | Postback configs (6), provider adapters (5), import batches (2) |

Dependencies: `shared` imports nothing from the folder; the three handler parts import only `shared`. Each handler is still a thin wrapper over the same `worker/database/*.js` function the dashboard uses. `test/handlers-affiliate-structure.test.js` checks the 40 names, that every handler the router calls exists, and that the helpers stay in one place.
