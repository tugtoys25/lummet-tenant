# HTML sanitizer (worker/sanitize.js, worker/sanitize/)

`sanitize.js` (586 lines) is now a facade over four parts. It re-exports the same 4 names (`sanitizeHtml`, `sanitizeUrl`, `sanitizeStyle`, `escapeHtml`), so every importer (controllers, renderers, API routes, author hub, newsroom) is unchanged. The original exported them with a final `export { ... }` line; each function is now exported where it is defined and the facade re-exports it.

| Part | Lines | Holds |
|---|---:|---|
| `sanitize/policy.js` | 170 | The allow-lists and block-lists: allowed tags, tags removed with their content, allowed attributes per tag, URL attributes, allowed URL and image schemes, dangerous CSS patterns |
| `sanitize/values.js` | 131 | Cleaning one value: `escapeHtml`, `sanitizeUrl` (decodes entities, strips control characters, checks the scheme), `sanitizeStyle` |
| `sanitize/tags.js` | 159 | Parsing attributes, deciding whether an attribute is allowed, cleaning its value (`target`, `rel`, booleans), rebuilding one tag |
| `sanitize/pipeline.js` | 128 | Removing dangerous tags with their content, comments and CDATA, tag-by-tag processing, and `sanitizeHtml` itself |

Dependencies: `policy` imports nothing; `values` imports `policy`; `tags` imports `policy` and `values`; `pipeline` imports `policy` and `tags`. The rule that decides what is safe is in `policy.js` only, so a change to the allow-lists is a one-file change. `test/sanitize-structure.test.js` checks this layout and a few classic attacks.
