# Newsroom upgrade — Phase 0 audit, implementation plan, Stage A status

Scope: `lummet-tenant/en` (Worker `en/worker/index.js`, D1 `DB`, KV `CACHE`, R2 `MEDIA_BUCKET`).
`lummet-control-plane` was inventoried only; no News code lives there.

## 1. What already exists (audit findings)

| Area | Existing implementation |
|---|---|
| Routes | `routes.js`: `/en/news` -> `newsList`; `/en/news/:slug` -> `news`; `/en/dashboard/news`; `/sitemap-news.xml` and `/en/sitemap-news.xml`; `/en/newsletter/{confirm,unsubscribe}` |
| Render | `controllers.js`: `renderNews` (~L1272), `renderNewsList` (~L3367). Templates `templates/pages/news.html`, `news-list.html`, `components/news_feed.html`. Dead code: `renderNewsbackup` |
| Data | `database/news.js`: getNews, getAllNews, getAllNewsAdmin, searchNews (4x `LIKE '%q%'`), getNewsByTag (`tags LIKE`), getRelatedNews |
| API | `api.js`: `/api/v1/public/news/list` (KV-cached under `PUBLIC_NEWS`, returns `n.*`), `/api/v1/news/{list,create,update,delete}` behind item-level access. Dead: `newsbackup*` endpoints |
| Schema | `news`: slug, title, content, author, author_id, ai_generated, seo_*, published, published_at, featured_image, og_image, excerpt, tags, created_by, ad_mode, ad_override_rules |
| Authors | `authors` (slug, name, bio, avatar_url, role, email, social_links, seo_*) + `database/authors.js`, `author.html`, `author_list.html`, `author-admin.js` |
| RBAC | `permissions(role,resource,action,allowed)`, seeded in `0006`; item-level access `0014` (`created_by` scoping) |
| Audit | `audit_logs` + `database/audit.js: logAudit()` (never throws) |
| Analytics | `analytics_events` (has `news_id`), `analytics_daily` (dimension `news` already aggregated), cron flags in `system_settings` |
| SEO | `render.js buildSEO`, `seo.js`, dynamic SEO via `renderer.loadDynamicSeo`, `breadcrumbs.js`, NewsArticle JSON-LD in `renderNews` (hardcodes `articleSection: "News"`) |
| Sitemap | `sitemap.js` news block: `published = 1`, `updated_at`, **no** `published_at` / news-sitemap schema |
| Newsletter | `newsletter_subscribers` (+ `notify_news` etc.), `newsletter.js`, `email-campaigns.js` |
| Cache | `cache.js` KV helpers + `invalidateNews` |
| Tests | Node built-in runner + `node:sqlite` D1 shim; **201 tests passed** before any change |

## 2. Findings that change the plan

1. **Schema drift.** Code and production use `news.published_at`; no migration in the repo adds it (a fresh tenant DB breaks). Fixed by `0045` (skip on DBs that already have it — production Level.casino does).
2. **`n.*` leaks.** Public reads/JSON return every `news` column (already exposes `created_by`, `ad_override_rules`). Consequence: **no internal field may be a column on `news`.** All internal editorial data is in `news_editorial` / `news_editorial_notes`. The existing leak is *not* changed in Stage A (behaviour change); recommended fix in Stage D: explicit column lists for the public list endpoint.
3. **Route collision.** `/en/news/:slug` is an article route. Section/region pages at `/en/news/regulation` would shadow or be shadowed by an article with that slug. Rule: **article slug always wins** (protects indexed URLs); section create/rename must reject slugs that exist in `news.slug`; router resolves article -> section -> region.
4. **Sitemap/`published_at`.** Scheduled (future `published_at`) articles are currently listed in the sitemap because it only checks `published = 1`.
5. **Hardcoded strings** in generic news code: `articleSection: "News"` and `"News"` breadcrumb labels — must become settings-driven.
6. **Search** is unindexable `LIKE '%q%'` on `content`; needs FTS5 or a title/excerpt-only index (validate FTS5 availability on D1 before committing).
7. **Migration process is manual per tenant DB** (README/shim comments): no migration tracker, so ALTERs are run-once.

## 3. Production baseline (from `levelcasd1.sql`, for the Phase 47 before/after check)

news = 24 rows, authors = 2, media_library = 101. Re-verify against the live DB immediately before deploy.

## 4. Feature matrix (EXISTING / EXTEND / NEW)

| Phase | Status | Plan |
|---|---|---|
| 1 sections | NEW | `news_sections` (done, Stage A) |
| 2 article types | EXTEND | `news.article_type` NULL=news (done) |
| 3 taxonomy | EXTEND | topics/countries/entities join tables (done); tags untouched |
| 4 country/region | EXTEND | reuse `countries`; `news_regions`+`news_region_countries` (done) |
| 5–6 sources / methodology | NEW | `news_article_sources`, `news.methodology` (done) |
| 7–8 fact-check / workflow | NEW | `news_editorial` (done); publishing stays `published` flag |
| 9–10 revisions / corrections | NEW | tables done; writers = Stage B |
| 11 labels | EXTEND | `news.labels` JSON (done) |
| 12 authors | EXTEND | +job_title/expertise/location/website_url (done); `role` holds newsroom role |
| 13–14 entities / series | NEW | tables done; `casino_id` reuses casinos |
| 15 related | EXTEND | `news_related`; keep `getRelatedNews` as fallback |
| 16–19 pages | EXTEND | Stage D, behind `news_v2_homepage` |
| 17–18 most read / trending | EXTEND | reuse `analytics_daily` (dimension `news`); KV-cached; `news_pins` for overrides |
| 20–21 firewall / disclosures | NEW | `news.content_class`, `disclosure_json`; verify `injectInlineAds` + component injection are skipped/labelled per class |
| 22 trust pages | EXTEND | use existing `pages` table if routing allows `/en/editorial/*`; else new routes |
| 23 media credits | EXTEND | +credit/photographer/credit_source/license (done) |
| 24–28 SEO/schema/sitemap | EXTEND | Stage E |
| 29 search | EXTEND | Stage G |
| 30–34 admin/RBAC/audit/analytics | EXTEND | new actions seeded admin-only (done); audit via `logAudit` |
| 35 newsletter | EXTEND | reuse `newsletter_subscribers.notify_*`; products table later |
| 43 live/developing | NEW | `news_timeline_updates` (done) |
| 54 flags | NEW | 7 flags in `system_settings`, all `false` (done) |

## 5. Stages

- **A. Database additions — DONE** (`0045`, `0046`, `test/newsroom-foundation.test.js`).
- B. Services/models (revisions writer, corrections, sources CRUD with URL validation, workflow guard, audit calls).
- C. Admin UI. D. Public rendering (flagged). E. SEO/schema/sitemap. F. Analytics. G. Performance/search. H. Full test + URL regression.

## 6. Deployment / rollback for Stage A

1. Back up: `wrangler d1 export <db> --output pre-newsroom.sql`.
2. Record counts (news/authors/media_library) and `PRAGMA table_info(news)`.
3. Skip `0045` if `published_at` exists. Run `0046` once per tenant DB.
4. Re-count; run `SELECT slug FROM news WHERE published=1` and diff against the pre-list.
5. Rollback: new tables are unused by any code yet, so rollback = do nothing (or drop the new tables, which hold no production data). Added columns are NULL and inert; SQLite `DROP COLUMN` is unnecessary and should not be used.

---

## 7. Stage B + C status (services, admin API, admin UI)

**Stage B — `worker/database/newsroom.js`**: vocabularies, feature-flag reader (fails closed), URL validation (http/https only; no credentials, private/link-local/metadata hosts), source/revision/correction/workflow/fact-check services, slug-collision guard, public loaders with explicit column lists and graceful degradation.

**Stage C**
- `worker/database/newsroom-taxonomy.js` — sections/topics/entities/series CRUD (archive = `active 0`, never delete), article metadata + relation writers (validate-then-write).
- `worker/newsroom-api.js` — admin API mounted from `api.js` after the auth gate, plus `beforeNewsUpdate` / `afterNewsUpdate` hooks on the existing `/api/v1/news/update` handler.
- UI: `/en/dashboard/newsroom` (`templates/pages/admin/newsroom.html`, `static/js/newsroom-admin.js`), nav link, and newsroom permission rows on the existing Permissions page.

### Routes added
`GET /en/dashboard/newsroom`

### APIs added (all under `/api/v1/newsroom/`, JSON, `Cache-Control: no-store`)
| Method | Path | Requires |
|---|---|---|
| GET | `meta` | news.read |
| GET | `article?id=` , `revisions?id=` , `revision?id=&v=` | news.read + item access |
| GET | `queue?view=drafts\|assigned_to_me\|review\|factcheck\|approved\|scheduled\|published\|corrections` | news.read (+ item-scope filter) |
| GET | `taxonomy/list?kind=` | news.read |
| POST | `article/meta/save` | news.update + item access |
| POST | `sources/save` | news.manage_sources |
| POST | `corrections/add` | news.correct (retraction: news.retract; update: news.publish) |
| POST | `timeline/add` | news.update |
| POST | `workflow/transition` `workflow/assign` `factcheck/save` | flag `news_editorial_workflow` + review/permission per target status |
| POST | `taxonomy/save` `taxonomy/archive` | news.manage_taxonomy |
| POST | `authors/profile/save` | news.manage_authors |
| POST | `media/credit/save` | media.create |

Writes additionally require `Content-Type: application/json`, a same-origin `Origin` (when present), and a body under 512 KB.

### Changes to existing files (all additive: 0 lines of existing logic removed, except one line extended in `permissions-admin.js`)
`api.js` (import, mount, two hook calls in `updateNews`), `routes.js`, `index.js`, `controllers.js` (one route/case/controller), `admin-nav.html` (one link), `permissions-admin.js` (newsroom rows).

### Behaviour changes that only occur when `news_editorial_workflow` is ON
1. Edits to existing articles are versioned (`news_revisions`) and audited.
2. An article that has entered the workflow (has a `news_editorial` row) cannot be published/unpublished through the plain update endpoint without `news.publish`. Legacy articles keep simple publishing.
3. Editing an article with a future `published_at` no longer clears the schedule (the legacy `updateNews` writes `published_at = NULL` when the form omits it).

### Known limitations / risks
- `article/meta/save` writes meta, then relations. Each part is validated before it writes, but if the relations part is rejected after meta succeeded, the meta change stays saved (the error is returned).
- The coarse write gate in `api.js` matches the prefix `/api/v1/news`, so it also covers `/api/v1/newsroom/`: a role needs `news.create` to reach newsroom POST endpoints in addition to the specific action. Derived by reading the code; not exercised by a test.
- `slug` edits through the legacy update still change the public URL and no redirect is created (revision history records it). Redirect handling is not built yet.
- Public rendering, SEO/schema, sitemap, search, most-read/trending, trust pages: not started (Stages D–G).
- `templates/layout/base.html` loads ~20 admin scripts on every page including public News pages (pre-existing). Not changed here; worth fixing in Stage G.
- The UI has been exercised only against a fake DOM, not in a browser.

---

## 8. Stage D status (public rendering, behind flags)

### Flags (all default OFF; read once per 30 s per isolate, fail closed)
| Flag | Turns on |
|---|---|
| `news_new_taxonomy` | section/type/label kicker, commercial + press-release + opinion/analysis notices, contextual disclosures, live timeline, editorial related stories, section-aware `articleSection` + breadcrumbs, `/en/news/<section>` pages |
| `news_sources_display` | public Sources list, Reporting & Methodology, JSON-LD `citation` |
| `news_corrections_display` | corrections/clarifications/updates/retractions banner above the body, JSON-LD `correction` |

With all three off, an article page is identical to before except the apostrophe entity noted below (verified by a real before/after HTML comparison, not just tests).

### Routes
`GET /en/news/<section-slug>[?page=N]` — resolved **after** articles: a live article with that slug always wins; a draft/scheduled/unknown slug falls through to the section, then 404. Invalid, non-integer or out-of-range `page` = 404. Canonical is `/en/news/<slug>` or `?page=N`; other query parameters never change it. Empty sections are `noindex`.
`GET /api/v1/newsroom/slug-conflicts` — admin: articles whose slug shadows an active section.

### Security fixes to EXISTING pages (found during this stage, always on, not flag-gated)
The template engine does not HTML-escape `{{vars}}`, which produced real XSS in production code paths. Confirmed by rendering payloads through the real controllers before fixing:
1. **Reflected XSS on `/en/news?q=` and `/en/news?tag=`** (no login needed): the query text reached `<title>`, `<h1>`, a `<p>` and JSON-LD unescaped. Fixed in `renderNewsList`.
2. **Stored XSS via article title** in the breadcrumb nav, `<title>` and both JSON-LD blocks (`</script>` in a value ended the block). Fixed in `render.js` (`<title>` escaped; JSON-LD serialised with `\u003c \u003e \u0026 \u2028 \u2029`, which JSON parsers decode identically) and `breadcrumbs.js` (labels/urls escaped); the article `<h1>`, image alt/url and caption are escaped in `renderNews`.
3. **Public JSON leak**: `/api/v1/public/news/list` and `/newsbackup/list` returned `SELECT n.*`, i.e. `created_by`, `ad_mode`, `ad_override_rules` and any future column. They now pass through an **allow-list** (`PUBLIC_NEWS_FIELDS`); `content` is kept for compatibility (used as an excerpt fallback by `app.js` / `news_feed.html`).
4. **Template-syntax injection**: raw `{{{vars}}}` are substituted first and the result is scanned again for `{{...}}`. All newsroom output goes through `esc()`, which also encodes `{` and `}`.

Visible effect on existing content: apostrophes/ampersands in titles are emitted as entities (`Google&#039;s`); they render identically. **Not fixed / needs a follow-up audit:** other templates that put `{{title}}`-style values in body/attribute positions (casino, review, page, country templates) were not audited.

### Behaviour notes
- Related stories, section lists and the sitemap-style queries only ever include `published = 1` and not-future `published_at`; draft/scheduled titles cannot leak through editorial relations.
- Pages are edge-cached by the existing `s-maxage=60, stale-while-revalidate=300`, so a newly published correction can take up to ~6 minutes to show. `invalidateNews` clears KV, not the CDN copy.
- Cost per article view: flags off => 1 cached flag read (1 D1 query per isolate per 30 s); flags on => up to 5 small parallel queries. No measurement on real D1 has been done (Stage G).
- New stylesheet `static/css/newsroom.css` (~5 KB, no JS/fonts) is linked only on pages that show newsroom blocks.

### Not done yet
News homepage v2, author/entity/series pages, most-read/trending, trust-center pages (`/en/editorial/*`), news sitemap changes (scheduled articles still listed), search improvements, newsletter products, analytics dashboards, redirect-on-slug-change.

---

## 9. Stage E status (sitemap, production-snapshot verification)

### Fixed in the EXISTING news sitemap (`/en/sitemap-news.xml`, and the news part of `/en/sitemap.xml`)
- **Scheduled articles were listed** (query was `published = 1` only) although the site returns 404 for them. Now filtered exactly like `renderNews` (`published_at` NULL or not in the future). Every URL in the sitemap is served with 200 (tested through the real controller).
- Ordered by `COALESCE(published_at, created_at)`; `lastmod` is parsed robustly (`updated_at` → `published_at` → `created_at`) and always `YYYY-MM-DD`.
- `<loc>` values are XML-escaped (all sitemaps, including the index).
- URL shape unchanged: `/en/news/<slug>`. No existing sitemap URL was removed.

### New: Google News sitemap `/en/news-sitemap.xml` (flag `news_google_sitemap`, migration `0047`, OFF)
Last 48 h, max 1000, `news:publication` (site name from settings, falling back to the request host), ISO-8601 date, escaped title. Excludes drafts, scheduled, `sponsored`/`commercial`/`press_release` content and press-release type. Returns 404 while off; listed in the sitemap index and `robots.txt` only when on. It is only useful once the publication is accepted in Google Publisher Center.

### Production-snapshot verification (`test/production-snapshot.test.js`)
Loads the repo's `levelcasd1.sql` export, migrates it to the repo schema with 0001–0044, then applies 0045–0047 like an operator would. Result on that snapshot (24 news, 2 authors, 101 media, 6 users, 63 audit rows):
- no migration errors except the documented duplicate `published_at` (0045 is a no-op on production);
- all counts equal; every original `news`, `authors` and `media_library` value byte-identical; new columns NULL; existing permissions untouched (+11 admin-only actions); all flags off;
- all 24 live articles: 200, one canonical, same title/body, **byte-identical HTML** before/after with flags off, and 200 with all flags on;
- news sitemap lists exactly the 24 live URLs before and after.
The test is skipped (visibly) if the export is absent.

### Findings
- `levelcasd1.sql` is committed at the repository root and contains user records including credential hashes. **Remove it from the repository (and from history) and rotate anything sensitive.**
- The snapshot predates migration `0041` (no `news.og_image`), i.e. it lags the repo. Confirm production has applied every migration through `0044` before applying `0046`.
- `robots.txt` has no `Disallow` for `/en/dashboard` or `/en/api`. Auth-gated, but crawlable entry points.
- Sitemap `<loc>` uses `/en/news/<slug>`; an article with a custom canonical override (dynamic SEO) is listed under its default URL, not the override. Not changed.

---

## 10. Stage F status (Editorial Trust Center)

Built on the EXISTING `pages` table, `/en/<slug>` catch-all route (nested slugs already routed) and `renderDynamicPage`; no new public route or table.

**Pages** (all default to *not created*): `editorial`, `editorial/about`, `editorial/standards`, `editorial/corrections`, `editorial/methodology`, `editorial/affiliate-disclosure`, `editorial/advertising`, `editorial/ai-policy`, `editorial/contact`.

**Workflow** (Newsroom → *Policies* tab, permission `news.manage_settings`, admin-only by default):
1. *Create draft* inserts an UNPUBLISHED page from a template (never overwrites an existing page with that slug).
2. Templates describe what the platform does (labels, corrections, sources); every fact about the publisher is a `[[FILL IN: ...]]` prompt. `{{site_name}}` / `{{site_url}}` resolve per tenant at render time from site settings.
3. The server **refuses to publish** while any `[[FILL IN]]` or the "DRAFT TEMPLATE" notice remains. Content is sanitized on save.
4. `/en/editorial` (hub) appends links to whichever policy pages are live, using the editors' own titles.

**Article integration** (only with a newsroom flag on, and only to LIVE pages): corrections banner → Corrections policy; Sources → "How we use sources"; each contextual disclosure → its policy page. Draft policy pages are never linked. Cost: one extra small query when a newsroom flag is on.

**Why a dedicated save path:** the generic `updatePage` never changes `published`, and `createPage` always publishes, so a draft could not be published from the existing admin. The trust API touches only the nine whitelisted slugs and cannot read or write any other page.

**Also fixed (existing `renderDynamicPage`)**: page `title`, author name/avatar/role/slug are HTML-escaped (the template engine does not escape `{{vars}}`). On the 12 published production pages the only difference is `Terms & Conditions` → `Terms &amp; Conditions` (identical when rendered); the other 11 are byte-identical.

**Finding, not changed:** generic page content (`content_json`) is stored and rendered exactly as authored, unsanitized — any user with `pages` write access can publish script. News article bodies are sanitized; pages are not. Consider sanitizing for non-admin authors.

**Before going live:** an editor must complete and publish the policies; publishing statements about company details, affiliate relationships, AI use, or contact details is a decision for the publisher, and legal review is advisable.

---

## 11. Stage G status (Most read, Trending, Pins, News homepage v2)

### Data sources (no new tracking)
Uses the existing `analytics_events` (PAGE_VIEW / CONTENT_VIEW rows with `news_id`; bots and duplicates excluded exactly as the daily aggregation does) and `analytics_daily` (`dimension_type = 'news'`, written by the existing cron).
- **Most read 24 h**: raw events of the last 24 h.
- **7 d / 30 d**: completed days from `analytics_daily` + today's raw events; if the rollup cron has never written news rows in the window, falls back to raw events. (If the cron was enabled only recently, the 30-day list reflects only the days rolled up so far: it is a ranking, not a total.)
- **Trending** (`news_trending`): `score = views_last_6h × (1 + growth) × 0.5^(age/48h)`, growth = how far the last 6 h beat the average 6 h bucket of the previous 18 h (capped 5×). Needs activity in the last 6 h; articles older than 14 days never trend.
- **Pins** (`news_pins`, slots `lead` / `featured` / `trending`): editor overrides with optional start/end; a pin of an article that is not live silently drops out. API: `GET pins/list?slot=`, `POST pins/save` (needs `news.review`, admin-only by default; audited).

### Cost control and correctness
The ranking (ids + counts) is cached in KV (600 s / 3600 s / 10800 s; trending 600 s). Articles are re-hydrated from `news` on every render with the live filter, so an unpublished/scheduled/deleted article disappears immediately even if the cached ranking still lists it. **Sponsored, commercial and press-release content is never promoted** in Most read or Trending (an editor may still pin anything live as the lead). Every stats failure returns an empty list, never an error.

### Homepage v2 (`news_v2_homepage`, off by default)
Applies only to plain `/en/news`; `?q=` and `?tag=` keep the existing page. Blocks: Top story (pin > newest with image), Latest news (featured pins first), Most read (24 h / 7 d / 30 d as no-JS `<details>`), Trending, per-section blocks and Analysis & research (need `news_new_taxonomy`), newsletter (existing signup form and handler), "How we work" links to LIVE trust pages. **A block with no content is not rendered.** Lead image is eager + `fetchpriority=high`, all images carry width/height, others lazy; no new JavaScript. Canonical is always `/en/news`. If the core article query fails the request falls back to the existing page (never a misleading "no articles yet" that would be noindex and edge-cached). Existing component placements (`components_top/bottom`) are kept.

### Measured on the production snapshot (SQLite `prepare` calls, not D1 latency)
| Page | D1 statements | HTML |
|---|---|---|
| Article, flags off | 19 (unchanged; flag read is cached 30 s per isolate) | 69.5 KB |
| Article, 3 newsroom flags on | 23 (+4, run in parallel) | same |
| `/en/news` existing | 14 | 110 KB (lists every article) |
| `/en/news` v2 | 28 (run in parallel) | 58 KB |
On the real snapshot the v2 page rendered Top story + Latest (10 live articles) + a real "Most read — last 7 days" block from 488 recorded news views; sections/analysis blocks were correctly absent (no article has a section or type yet).

### Corrected earlier claim
The committed snapshot test named "flags ON: every live article renders" was silently running with flags OFF: flags are cached per DB handle for 30 s and earlier tests had already read them. (A standalone check with a fresh handle had rendered all 24 with flags on.) The test now resets the cache (`resetNewsFlagCache`) and asserts the flags are really on.

### Not done yet
Region/country landing pages (`/en/news/europe`, `/en/news/united-kingdom`) and the "Regional news" homepage block; author / entity / series public pages; improved search (FTS, filters); newsletter *products* (only the existing single signup is reused); newsroom and per-article analytics dashboards; redirect on slug change; real D1 latency / Lighthouse (LCP/CLS/INP) measurement; manual QA at 320-1440 px.

---

## 12. Stage H status (slug redirects; region, country, topic, entity, series pages)

### Slug-change redirects (migration `0048_news_redirects.sql`, always on)
Editing an article's slug through the existing update endpoint used to make the old URL 404 (lost rankings and inbound links). The update handler now records the old slug (`news_redirects`, keyed by `news_id`), and `/en/news/<old>` answers **301 → the article's current slug**. Chains resolve in one hop; renaming back removes the stale row; a draft, scheduled, or deleted target is a 404, never a redirect; a live article always wins over a redirect row. Recording happens after the save succeeded and never throws; if the table does not exist (migration not applied) behaviour is exactly as before.

### Landing pages (`/en/news/...`)
Resolution when no live article has the slug: redirect → **section → region → country** (flag `news_new_taxonomy`) → 404.
| URL | Content | Flag |
|---|---|---|
| `/en/news/<section>` | section + its direct children | `news_new_taxonomy` |
| `/en/news/<region>` (`europe`, `asia`, ...) | articles tagged with the region, whose primary/additional country is mapped to it | `news_new_taxonomy` |
| `/en/news/<country>` (`united-kingdom`) | primary or additional country | `news_new_taxonomy` |
| `/en/news/topic/<slug>` | topic | `news_new_taxonomy` |
| `/en/news/series/<slug>` | editorial order with "Part N" that continues across pages | `news_new_taxonomy` |
| `/en/news/entity/<slug>` | About block (logo, type, country, website) + articles; JSON-LD `about` = Person / GovernmentOrganization / Organization | `news_entity_pages` |
All pages: live articles only, 12 per page, canonical `?page=N` (query noise ignored), out-of-range/invalid `page` = 404, empty = `noindex`, breadcrumbs + JSON-LD, escaped output.

**Countries reuse the existing `countries` table** (published only). Its `name` is editor-typed (production has "UK" for GB), so the canonical slug comes from the standard English region name for the ISO code (`united-kingdom`); the table's own name-slug and the lowercase ISO code (what `/en/country/<code>` uses) are aliases that 301 to it: one indexable URL per country. The slug map is cached per isolate for 60 s.

**Regions need data:** an admin maps countries to a region with `POST /api/v1/newsroom/regions/countries/save` (`news.manage_taxonomy`; `GET regions/countries?region=`). Until mapped, a region page lists only articles tagged with that region.

**Collisions:** a section may not use a country (canonical or alias) or region slug, or the reserved words `entity`, `topic`, `series`, `country`, `region`, ...; an existing live article always wins over all landing slugs. Verified on the production snapshot: none of the 24 live article slugs collides with any landing slug.

### Not done yet
Admin UI for region-country mapping and pins (API only); links from article pages to their entity/country/series/topic pages; author page upgrade (job title, expertise, article count); landing pages in the sitemap; improved search; newsletter products; analytics dashboards; Lighthouse/D1-latency measurement; manual QA.

---

## 13. Stage I status (author profiles, article discovery)

### Bugs fixed on the EXISTING author page (always on)
Found by reading the code and confirmed with tests:
1. **Scheduled (embargoed) articles were listed publicly** on `/en/author/<slug>` (title, excerpt, image, dead link) because the query only checked `published = 1`. Now live-only.
2. **"Articles" counter counted every row**, drafts and scheduled included. Now live, published articles only (identical on the production snapshot: 23 and 1, all live). The Reviews/Pages counters have the same flaw and were left alone.
3. **Unpublished authors were reachable by direct URL** (the author list already hides them). Now 404. Both real authors are `published = 1`.
4. **Escaping**: name, bio, role, avatar, and review-card title / casino name / logo were emitted raw (`{{vars}}` are not escaped) and `social_links` was raw HTML. Now escaped / sanitized. On real data the only difference is entity encoding (`Founder &amp; Editor`, `G&#039;Day`, `Terms &amp; Conditions`), which renders identically.

### Author profile (flag `news_new_taxonomy`)
Uses the columns added in `0046`: `job_title`, `expertise`, `location`, `website_url` (+ the existing `role`). Shows a facts list (role, expertise, based in, website with `rel="me noopener noreferrer"`, live article count), prefers `job_title` over `role` in the header, and upgrades the Person JSON-LD (`jobTitle`, `knowsAbout`, `workLocation`, `sameAs`, `worksFor` = `NewsMediaOrganization` with the publication name from settings, falling back to the host). Empty fields are omitted. With the flag off the page and legacy schema are unchanged. Admin: Newsroom → **Authors** tab (list without email addresses; edit role from the standard list, job title, expertise, location, website); `GET authors/list` needs `news.manage_authors`.

### Article discovery (flag `news_new_taxonomy`; entities also need `news_entity_pages`)
Below the article: region and country chips (canonical country URLs, published countries only), topic chips (active), company/person chips (only when entity pages are on); **series navigation** ("Part 2 of 5", previous / next among LIVE articles); **More from <section>** (latest 4 live stories, excluding the article itself). The byline shows the author's job title. Nothing renders when there is nothing to show. Cost: one UNION query plus up to two more (series neighbours, same-section stories); measured bound in a test.

### Not done yet
Admin UI for region-country mapping and pins (API only); landing pages in the sitemap; improved search (filters, FTS); newsletter products; newsroom / per-article analytics dashboards; Lighthouse / real D1 latency; manual QA at 320–1440 px; sanitizing generic page content.

---

## 14. Stage J status (newsroom analytics)

### What the existing data can and cannot answer (verified on the production snapshot)
News page views are logged as `CONTENT_VIEW` with only country, city, the raw `Referer` and the landing page. There is **no visitor id, session, device, UTM or bot flag** on any of the 488 recorded news views, and 91 % have no referrer. So:
| Spec metric | Status |
|---|---|
| Articles published, publication frequency | available (from `news`) |
| Page views, daily series, most read, trending | available (bots/duplicates excluded when flagged) |
| Traffic by section / author / article type / country | available |
| Traffic source, organic search | available, **from the referrer only** (channels: direct, internal, search, social, newsletter, paid, referral); spoofed hosts such as `google.evil.com` count as referral |
| Unique visitors / unique readers | **not available**: reported as `available: false`, never estimated |
| Newsletter conversions | **site-wide signups/confirmations only**; not attributed to articles (the signup form records no source article) |
| Article engagement (scroll, time, link clicks) | **not recorded**; "views arriving from other news articles" (internal referrer) is shown as a proxy for related-story clicks |
| Device split | not recorded until enrichment is enabled |
Every response carries a `data_quality` block (bot events excluded, referrer/UTM coverage, warnings) and the UI shows it. On the real snapshot it warns that no view has ever been flagged as a bot, that unique visitors are unavailable, and that most traffic shows as direct; 73 % of the recorded views come from one country, which is what unfiltered crawler traffic tends to look like (an observation, not a conclusion).

### Enrichment (flag `news_analytics_enrichment`, migration `0049`, OFF)
When on, each news view also stores a bot flag (conservative user-agent rules, empty UA = bot), device class and UTM parameters. Flagged bot views are still stored but excluded from every count (most read, trending, dashboards, daily rollups) **from then on**; history is not rewritten. It introduces no visitor identifier: doing that (e.g. a daily-rotating salted hash) is a privacy decision for the publisher and was not made here.

### Access and cost
`news.view_analytics` (admin-only by default). Every query is constrained by the caller's item-level news access before aggregating, so a user limited to their own articles sees only those and no site-wide newsletter figures. Unrestricted results are cached in KV for 10 minutes; scoped results are never cached or shared. Per-article queries use the new index `analytics_events(news_id, occurred_at)` (build it in a quiet period on a very large table). The overview runs 12 small parallel aggregate queries over a 7/30/90-day window.

### UI
Newsroom → **Analytics** tab (period selector, data-limit warning, KPI cards, daily views and publication-frequency bars, most read, trending, section/author/type/country/source tables, newsletter, engagement note) and a **Performance (last 30 days)** block in each article panel. No SVG/innerHTML: bars are plain elements.

### Other fix found while testing
The admin UI passed `null` children straight to DOM `append()`, which renders the text "null"; users without correction permissions would have seen it. Fixed (`put()` helper) and the fake DOM in the tests now mimics real `append()` semantics so it cannot come back.

### Not done yet
Admin UI for region-country mapping and pins (API only); landing pages in the sitemap; improved news search; newsletter products and article-level signup attribution; engagement events; visitor-level metrics (needs a privacy decision); Lighthouse / real D1 latency; manual QA at 320–1440 px.

---

## 15. Stage K status (news search)

### Problem
The existing search (`searchNews`) runs `LIKE '%q%'` over title, excerpt, **full article body** and tags on every request: it cannot use an index, its cost grows with articles × body size, it has no filters, no ranking, no pagination (every match is returned) and its result page (`?q=`) is indexable.

### Design (migration `0050_news_search.sql`, flag `news_search_v2`, OFF)
A small application-maintained inverted index: `news_search_terms(term, news_id, weight)` with `PRIMARY KEY (term, news_id) WITHOUT ROWID`, plus `news_search_docs(news_id, content_hash)` so re-indexing skips unchanged articles. A query is one index seek per word.
- **Semantics:** every word must match; the **last word also matches as a prefix** (`regul` → regulation); no stemming, no phrase search, no substring search. Ranking = sum of matched term weights (title 10 › entity/topic/tag names 4 › section/excerpt 3 › body 1), then newest first. Body text contributes its 150 most frequent words per article, which keeps the index small.
- **Why not FTS5:** it needs triggers on the production `news` table and, as far as I know, D1's export tooling does not support databases with virtual tables (verify against current Cloudflare docs before switching). A plain table is exportable, trigger-free and works on any D1. FTS5 remains an option if stemming/phrases matter more than those constraints.
- **Maintenance:** create/update hooks (after the save, never throw) and classification saves re-index the article; **Newsroom → Search → Rebuild index** backfills in bounded batches (25 per call, resumable, skips unchanged). Deletes cascade. A stale index can never reveal anything: the public path always applies the live filter and hydrates from `news`.
- **Filters** (all combinable with the keyword or on their own): section (with child sections), author, country (canonical country slug), entity, article type (`news` = untyped), date range. An unknown or malformed filter value returns an empty result and names the filter; it never widens to "everything". At most 8 query words; symbols/stop-words-only queries match nothing; all values are bound parameters made of `[a-z0-9]` or resolved to ids first.
- **Public page:** `/en/news?q=…&section=…&…` renders a real form (works without JavaScript; filters collapse into `<details>`), a result count, 12 results per page, and pagination that keeps the filters. Result pages are **`noindex, follow`** with canonical `/en/news` (the old search page was indexable). Facets (sections, authors, types, countries, entities) list only values that have live articles and are cached 10 minutes. If the index has never been built the request **falls back to the existing search** instead of showing "no results". `?tag=` is unchanged.
- **Admin:** `GET /api/v1/newsroom/search` (needs `news.read`, item-access scoped, includes drafts and scheduled, filters by status and workflow status, 25 per page; workflow state is selected only in admin mode), `GET search/status`, `POST search/reindex` (`news.manage_settings`); Newsroom → **Search** tab.

### Verified
- Real production articles: 24/24 indexed (3,832 terms, ~160 per article), every article is found by a word of its own title, nothing non-live is ever returned, and everything the old search finds by title is found by the new one. At 24 articles both searches take well under a millisecond, so **no speed-up can be shown at this size**; the benefit is the cost curve at larger sizes, which was not measured on D1.
- Term lookups are index seeks (query-plan test), an oversized article is written in statements of at most 90 bound parameters (D1 allows 100).
- Reflected XSS payloads in `q` and filter values are inert in the title, form, heading and JSON-LD.

### Not done yet
Admin UI for region-country mapping and pins (API only); landing pages in the sitemap; newsletter products and article-level signup attribution; engagement events; visitor-level metrics (privacy decision); "did you mean" / typo tolerance; Lighthouse and real D1 latency; manual QA at 320–1440 px.
