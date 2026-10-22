# Architecture: AI retrieval (`worker/ai/retrieval.js` + `worker/ai/retrieval/`)

Since v22.22 `worker/ai/retrieval.js` (1,230 lines) is a facade that re-exports its six public functions from 6 modules in `worker/ai/retrieval/`. Since v22.28 the search itself (`retrieve.js`) is split further into one function per table group in `worker/ai/retrieval/search/`. `assistant.js`, `studio.js`, `preview.js`, `digest.js`, `prompt.js` and the tests keep importing `./retrieval.js`.

Public API (unchanged): `retrieve`, `buildContextString`, `extractContextUrls`, `sanitizeAnswerUrls`, `createStreamingUrlSanitizer`, `guardGeoFacts`.

## Parts

| File | Holds | Lines |
|---|---|---:|
| `retrieval/match-helpers.js` | Constants (`MAX_RESULTS`, country names, table list) and name matching: `normalizeForMatch`, `levenshtein`, `fuzzyFindCasinoSlug`, `truncate` | 85 |
| `retrieval/retrieve.js` | `retrieve`: works out the search parameters from the plan (or keywords), then calls the 15 search functions in a fixed order | 75 |
| `retrieval/search-helpers.js` | Small helpers `retrieve` uses: table choice, geo status, search terms, country detection, listing/geo text tests | 61 |
| `retrieval/context-string.js` | `buildContextString`: turns results into the prompt context | 207 |
| `retrieval/url-guard.js` | URL fidelity guard: `extractContextUrls`, `sanitizeAnswerUrls`, `createStreamingUrlSanitizer` | 75 |
| `retrieval/geo-guard.js` | Geo/licensing fact guard: `guardGeoFacts` | 77 |

### The search parts (`retrieval/search/`)

`retrieve` builds one `ctx` object (db, text, search terms, casino names, detected country, intent, listing/geo/comparison flags, tables from the plan, ...) and one `results` object, then runs the searches one after another. Each search is `async function searchX(ctx, results)`: it checks `shouldSearchTable(...)` itself, runs its own queries inside its own try/catch and fills its own fields of `results`. The code of each search is the old block, line for line.

| File | Functions | Lines |
|---|---|---:|
| `search/casinos.js` | `searchCasinos` (geo, listing, keyword and fuzzy search, features, geo status, categories, payment methods) | 175 |
| `search/reviews.js` | `searchReviews`, `searchNews` | 105 |
| `search/items.js` | `searchContentItems` (content items and research items; the two share `itemTerms`, so they stay together) | 87 |
| `search/platform-updates.js` | `searchPlatformUpdates` | 115 |
| `search/pages.js` | `searchPages`, `searchFaqs`, `searchAuthors` | 95 |
| `search/catalog.js` | `searchCountries`, `searchCategories`, `searchSeoPages`, `searchSeoMeta` | 86 |
| `search/site-structure.js` | `searchPaymentMethods`, `searchNavItems`, `searchHomepageSections` | 74 |

The order of the calls in `retrieve.js` is the order of the old blocks and decides the order of the database queries; a test pins it. Searches only talk to each other through `results` (and `ctx`, which they must not change).

To add a table: write `searchX(ctx, results)` in the fitting file (or a new one) and add one `await` line to `retrieve.js`.

Imports: `retrieve` uses `search-helpers` and the `search/*` parts, which use `match-helpers` and `search-helpers`; `search-helpers` uses `match-helpers`; the other three parts import nothing. No cycles (a test checks it).

## Rules

- A new public function goes into the fitting part and is re-exported by name in `worker/ai/retrieval.js`.
- Keep every part under 800 lines and every `search/` part under 300 (a test checks it).
- Search parts import only `../match-helpers.js` and `../search-helpers.js`, never each other.

## Next in the restructuring

The three stylesheets (`main.css`, `dashboard.css`, `supportive.css`).
