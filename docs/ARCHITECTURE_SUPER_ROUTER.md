# Super API router (worker/super/router.js, worker/super/routes/)

`router.js` (513 lines) held the allowlist of 227 routes and the code that serves them. The routes now live in five files in `worker/super/routes/`, and `router.js` (162 lines) keeps the dispatcher: it joins the groups, matches the request, checks the signature, calls the handler and writes the audit row. `handleSuperApi` is still the only export and `worker/app/routes/services.js` is unchanged. There is still no wildcard passthrough and no arbitrary-SQL endpoint (rule #25): every route is one array entry.

| File | Lines | Routes |
|---|---:|---|
| `routes/core.js` | 178 | Handshake, health, capabilities; casinos, reviews, news, pages, categories, research items; inquiries, submissions, notifications, subscribers; settings, permissions, item access; SEO and category pages |
| `routes/affiliate.js` | 70 | Partners, programs, accounts, commercial terms, offers, tracking links, postback configs, provider adapters, import batches |
| `routes/analytics.js` | 46 | Analytics, reports, campaigns, alerts |
| `routes/ai-newsroom.js` | 61 | Editorial AI tools, newsroom taxonomy, article metadata and relations |
| `routes/research.js` | 33 | Research sources, claims and claim-source links |
| `router.js` | 162 | `ROUTES` (the groups joined), `matchRoute`, `actionForMethod`, `handleSuperApi` |

Each entry is `[METHOD, path-pattern, handler, resource]`. The first match wins, so the order inside a group matters (literal segments such as `defaults` come before `:id`); the groups are joined in the order above, which is the order of the old single table. Each route file imports only the handler namespaces it uses.

`test/super-router-structure.test.js` compares the joined table with `test/fixtures/super-routes-v22.58.json`, the 227 routes as they were before the split (method, path, handler name, resource), so a route cannot be lost, moved inside its group or pointed at another handler without a test failing. Tests that look for a route in the source read `router.js` and the route files together (`test/support/super-router-source.js`).

To add a route: add one line to the right group file (and the handler to its handlers module). To add a group: a new file in `routes/`, one import and one `...GROUP` line in `router.js`, and a line in the fixture.
