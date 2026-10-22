# Architecture: AI Studio (`worker/ai/studio.js` + `worker/ai/studio/`)

Since v22.31 `worker/ai/studio.js` (878 lines) is a facade that re-exports its 24 public names from 9 modules in `worker/ai/studio/`. `api/platform.js` and the tests keep importing `ai/studio.js`.

The rules in the header comment of `studio.js` still hold: generation only (nothing is saved by a model call; saving goes through `applyResult`, which creates drafts or unverified claims after a permission check), the model only gets the facts given, fetched pages are data not instructions, and model text is escaped before it becomes page HTML.

## Parts

| File | Holds | Lines |
|---|---|---:|
| `studio/config.js` | Constants: `MODEL`, limits, rate limit, item and research types, rewrite modes | 30 |
| `studio/text-utils.js` | `clip`, `esc`, `textToHtml`, `slugify`, `parseJsonLoose`, `stripHtml`, `checkUrl`, `fetchSourceText` (page fetching with the private-address guard) | 100 |
| `studio/facts.js` | `loadItemFacts` and the field lists: the facts the model may use for a casino or item, and the research reference | 67 |
| `studio/tasks.js` | `TASKS` (the 16 task definitions and their prompts) and `listTasks` | 166 |
| `studio/run-task.js` | `cleanInput`, source gathering, the model call (`ask`) and `runTask` | 99 |
| `studio/apply-result.js` | `applyResult`: saving a result as a draft / unverified claim / SEO fields, with permission checks | 125 |
| `studio/audit.js` | `auditContent`, `draftFeedbackFix`, `listDraftFaqs` | 84 |
| `studio/history.js` | `recordHistory`, `readHistory` and the retention constant | 36 |
| `studio/http.js` | `handleAiStudio`: the routes under `/api/v1/ai-studio/` | 187 |

Imports go one way: `config` and `text-utils` at the bottom, then `facts`, `tasks`, `run-task`, `apply-result`, `audit`, `history`, and `http` on top. No cycles (a test checks it).

## Rules

- A new task goes into `TASKS` in `tasks.js` (its prompt and fields) and needs no change elsewhere unless it saves something (`apply-result.js`).
- A new public function goes into the fitting part and is re-exported by name in `worker/ai/studio.js`.
- Only `http.js` builds `Response` objects. Keep every part under 300 lines (a test checks it).
