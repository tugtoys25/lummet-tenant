# Lummet Platform — Developer Documentation

This document covers the entire codebase across both repositories:
**`lummet-tenant`** (the multi-tenant casino/affiliate platform Worker,
deployed once per brand) and **`lummet-control-plane`** (the separate,
central Worker that manages all tenant deployments). It is organized
feature by feature, file by file, and ends with concrete setup /
integration commands.

> Generated from the current codebase state (post performance-patch,
> post `seo_keywords` feature, post sitemap draft-leak fix). See
> [Recent Changes](#recent-changes) for a summary of the latest
> commits' effects.

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Repository 1: `lummet-tenant`](#repository-1-lummet-tenant)
   - [Request Lifecycle](#request-lifecycle)
   - [Core Rendering Pipeline](#core-rendering-pipeline)
   - [Routing & Page Controllers](#routing--page-controllers)
   - [Database Layer (`worker/database/`)](#database-layer-workerdatabase)
   - [Auth & Access Control](#auth--access-control)
   - [Admin / Content API (`api.js`)](#admin--content-api-apijs)
   - [AI Assistant (`worker/ai/` + `worker/lummet/`)](#ai-assistant)
   - [Affiliate, Offers & Tracking](#affiliate-offers--tracking)
   - [Conversion Postback / Import / Adapters](#conversion-postback--import--adapters)
   - [Analytics, Reporting & Alerts](#analytics-reporting--alerts)
   - [Super API (`worker/super/`)](#super-api-workersuper)
   - [Media](#media)
   - [Cron / Scheduled Jobs](#cron--scheduled-jobs)
   - [Templates](#templates)
   - [Static Assets](#static-assets)
   - [Migrations](#migrations-lummet-tenant)
3. [Repository 2: `lummet-control-plane`](#repository-2-lummet-control-plane)
4. [Multi-Tenant Deployment Model](#multi-tenant-deployment-model)
5. [Recent Changes](#recent-changes)
6. [Integration / Setup Commands](#integration--setup-commands)

---

## High-Level Architecture

```
┌─────────────────────────┐         HTTPS, HMAC-signed          ┌──────────────────────────┐
│   lummet-control-plane   │ ───────── Super API (/en/api/ ────▶ │      lummet-tenant        │
│   (1 Worker, 1 D1 DB)    │ ◀───────── super/*) ──────────────  │  (1 Worker per brand,     │
│                          │                                      │   own D1 + KV + R2)       │
│  Tenant registry, RBAC,  │                                      │                           │
│  encrypted credentials,  │                                      │  Public site + admin      │
│  Lummet's own admin      │                                      │  dashboard + AI assistant │
│  accounts (separate      │                                      │  + affiliate/analytics    │
│  identity system)        │                                      │  engine                   │
└─────────────────────────┘                                      └──────────────────────────┘
```

- **`lummet-tenant`** is the actual product: a Cloudflare Worker that
  serves a full casino-affiliate content site (casinos, reviews, news,
  country/category hubs, SEO landing pages), a content-management
  dashboard, a public AI assistant, and a full affiliate/analytics/
  conversion-tracking backend. The **same codebase** is deployed
  multiple times — once per brand — each as its own named Wrangler
  environment with its own D1 database, KV namespace, and R2 bucket.
  Six brand environments exist today: `freewin` (default), `lummet`,
  `levelcasino`, `clustercasino`, `neuroodds`, `legendodds`,
  `brilliantodds`.
- **`lummet-control-plane`** is a separate, standalone Worker + D1
  database that never touches tenant content directly. It manages the
  tenant registry, issues/rotates HMAC credentials, and talks to each
  tenant exclusively through that tenant's `/en/api/super/*` **Super
  API** — a machine-to-machine, HMAC-signed interface. It has its own
  independent admin-identity system (`lummet_admins` /
  `lummet_sessions`), completely separate from any tenant's user
  accounts.
- Both repos are zero-build: plain ES modules deployed as-is via
  `wrangler deploy`. No bundler, no framework, no external runtime
  dependencies for the Worker itself (tests use Node's built-in
  `node:test`/`node:sqlite`, but that's dev-only).

---

## Repository 1: `lummet-tenant`

```
lummet-tenant/
├── en/
│   ├── worker/            # All server-side logic (Cloudflare Worker)
│   ├── templates/         # HTML templates (custom {{mustache}}-ish templating, see render.js)
│   ├── static/             # CSS/JS/images served as Worker Assets
│   ├── migrations/         # D1 SQL migrations (0002 → 0037 + schema.sql)
│   ├── docs/                # super-api.md, postback-api.md, country-directory.md
│   ├── lummet/              # Static landing page for the AI-assistant subdomain
│   └── test/                 # node:test suite (148 tests, zero deps)
├── wrangler.jsonc           # Default env (freewin) + 6 named brand environments
├── robots.txt / disavow.txt
└── README.md
```

### Request Lifecycle

1. **`worker/index.js`** (570 lines) — the Worker's `fetch()` entry
   point. Resolves site context (`getSiteContext`), handles a handful
   of special-cased paths (the Lummet AI-assistant subdomain routing
   via `worker/lummet/router.js`, current-user resolution via
   `auth.js`), then hands off to `routes.js` for path matching and
   `controllers.js` for the actual page render.
2. **`worker/routes.js`** (394 lines, `getRoute(request)`) — a plain
   if/else + regex router (no framework). Maps every public URL
   (`/en/casino/:slug`, `/en/country/:code`, `/sitemap.xml`, etc.),
   every `/en/dashboard/*` admin page, every `/en/user/*` account
   page, and API/media/sitemap prefixes to a `{ type, ...params }`
   descriptor that `index.js` dispatches on.
3. **`worker/controllers.js`** (4,436 lines) — one `render*` function
   per page type (see [Routing & Page Controllers](#routing--page-controllers)).
   Fetches data via the `worker/database/*` layer, then calls into
   `render.js` / `component-engine.js` to produce HTML.
4. **`worker/render.js`** (`Renderer` class, 824 lines) — loads and
   assembles templates (header/footer/sidebar/base + page template),
   injects SEO tags/schema.org JSON-LD, and does simple
   `{{variable}}` substitution. Templates and components are cached
   per-request (`this.templateCache`, a `Map` keyed by template name)
   to avoid re-fetching the same static asset multiple times per page.
5. **`worker/component-engine.js`** (274 lines) — the pluggable
   "component" system: editors attach reusable components (banners,
   CTAs, FAQ groups, casino grids, comparison tables, HTML blocks,
   text blocks) to specific pages/injection-points via the admin
   dashboard, stored in `page_components`. `renderAllInjectionPoints()`
   loads and renders every component assigned to a page, grouped by
   injection point (`top`, `content_top`, `content_bottom`, `bottom`,
   `sidebar`), all rendered **concurrently** (see
   [Recent Changes](#recent-changes)).

### Core Rendering Pipeline

| File | Purpose |
|---|---|
| `worker/index.js` | Worker entry point; dispatch to routes/controllers |
| `worker/routes.js` | URL → route-descriptor mapping (`getRoute`) |
| `worker/controllers.js` | One `render*()` per page/route; the largest file in the repo |
| `worker/render.js` | `Renderer` class: template loading, SEO/schema injection, variable substitution, per-request template cache |
| `worker/component-engine.js` | Pluggable page-component system (banners, CTAs, grids, FAQs, etc.) |
| `worker/site-context.js` | `getSiteContext(request, env)` — resolves the current tenant's branding/config (siteName, logo, origin, theme) once per request, cached |
| `worker/site-settings.js` (1,740 lines) | `getSiteSettings()` (KV-cached DB read), `buildSiteManifest`, `buildThemeCss`, `buildGaScript`, `buildComplianceHtml`, `buildHomepageSectionsHtml` — everything driven by the admin **Settings** page |
| `worker/breadcrumbs.js` | Breadcrumb trail + `BreadcrumbList` schema.org generation |
| `worker/seo.js` (`seoEngine`) | Shared SEO helpers used across controllers |
| `worker/sitemap.js` (`sitemapEngine`) | `/sitemap.xml` + per-type sitemaps (casinos, reviews, news, updates, authors, categories, countries, pages, seo-pages) — **draft/unpublished rows are filtered out** (fixed; see Recent Changes) |
| `worker/cache.js` | Generic KV get/set/invalidate helpers + typed `invalidate*()` functions (casinos, news, countries, categories, nav) called after admin writes |
| `worker/geo.js` (`geoEngine`) | Resolves the visitor's country from Cloudflare's `request.cf`, used for GEO-gated casino allow/block rules everywhere |
| `worker/sanitize.js` (586 lines) | HTML/input sanitization used by admin forms and rendered content |
| `worker/database.js` | Thin D1 connection helper |
| `worker/bootstrap.js` | `createAdminUser()` — one-time first-admin bootstrap |
| `worker/item-access-test.js` | `runItemAccessTests(env)` — in-Worker smoke test for the item-level access/RBAC system |

### Routing & Page Controllers

Public site routes (all in `controllers.js`, dispatched from
`routes.js`):

| Route | Controller |
|---|---|
| `/`, `/en`, `/en/home` | `renderHome` |
| `/en/casino/:slug` | `renderCasino` |
| `/en/casino` | `renderCasinoList` |
| `/en/review/:slug` | `renderReview` |
| `/en/review` | `renderReviewList` |
| `/en/news/:slug` | `renderNews` |
| `/en/news` | `renderNewsList` (supports `?q=` search and `?tag=` filter) |
| `/en/updates/:slug`, `/en/updates` | `renderUpdate`, `renderUpdatesList` |
| `/en/author/:slug`, `/en/author` | `renderAuthor`, `renderAuthorList` |
| `/en/country/:code` | `renderCountry` (casino allowlist hub per country) |
| `/en/country` | `renderCountryList` (A–Z directory + featured markets) |
| `/en/country/:code/:slug` | `renderCountryCustomPage` (editorial SEO landing page) |
| `/en/category/:slug` | `renderCategory` |
| `/en/category` | `renderCategoryList` |
| `/en/category/:slug/:code` | `renderCategoryCountryPage` (category × country combo; falls back to an auto-generated render if no editorial page exists but real casinos are eligible) |
| `/en/affiliate/:slug` | `renderAffiliate` |
| `/en/go/:slug` | tracking-link redirect (see `tracking/redirect.js`) |
| `/en/:slug` (catch-all) | `renderDynamicPage` — generic CMS pages |
| `/en/login`, `/en/register` | `renderLogin`, `renderRegister` |
| `/en/user/*` | `renderUserDashboard`, `renderUserSubmitCasino`, `renderUserInquiries`, `renderUserProfile`, `renderUserNotifications`, `renderUserBookmarks` |
| `/sitemap*.xml`, `/en/sitemap` | `sitemapEngine` + `renderSitemapPage` |
| `/robots.txt` | `robots()` |
| any unmatched path | `render404` |

Admin dashboard routes (`/en/dashboard/*`, one `renderDashboard*`
function each in `controllers.js`) cover: casinos (list/create/edit),
reviews, news, updates, country pages, category-countries, generic
pages, settings, AI tools, categories, countries, authors, media, nav,
permissions, item-access, users, inquiries, submissions, notifications,
banners, affiliate partners/programs/accounts, commercial terms,
postback configs, import history, provider adapters, offers, tracking
links, analytics, campaigns, reports, components, SEO overview. Every
one of these follows the same pattern: authenticate/authorize, fetch
via `worker/database/*`, render via `Renderer`.

### Database Layer (`worker/database/`)

Every table has a dedicated module exposing plain async CRUD/query
functions taking `db` (the D1 binding) as the first argument — no ORM.
Grouped by domain:

**Content**
- `casinos.js` — casino CRUD, category assignment, GEO-allowlist queries (`getCasinosByCountryAllowlist`, `getCasinosByGeoRules`)
- `reviews.js` — review CRUD, `getCasinoReviews`, `getLatestReviews`
- `news.js` — news CRUD, `searchNews`, `getNewsByTag`, `getRelatedNews`
- `pages.js` — generic CMS page CRUD
- `platform-updates.js` — "what's new" changelog entries
- `authors.js` — author profiles, `getAuthorContent`/`getAuthorStats` (aggregates their reviews/news)
- `review_blocks.js` — structured sub-sections within a review (pros/cons/etc. blocks)
- `related-casinos.js` — the "related casinos" recommendation engine: category/feature-match scoring with a quality fallback (`scoreRelatedCasinoCandidates`, `getRelatedCasinos`)

**Geography / Taxonomy**
- `countries.js` — country CRUD, `getFeaturedCountries`, `getPublishedCountries`
- `categories.js` — category CRUD, `getCategoryCasinos`
- `geo.js` — per-casino GEO allow/block rules (`getGeoRule`, `setCasinoGeoRules`)
- `seo-pages.js` — editorial SEO landing pages (`country_custom` and `category_country` types), eligibility discovery (`discoverEligibleCategoryCountryCombos`)
- `nav.js` — navigation items, including auto-synced nav entries and GEO-filtered page-level subnav (`getScopedNavItems`, `filterPageNavItemsByGeo`)

**Site/Admin**
- `settings.js` — key/value site settings (`getSetting`, `saveSettings`)
- `seo_meta.js` — per-page dynamic SEO override (title/description/keywords/canonical)
- `components.js` — the component-engine's admin-facing CRUD (create/assign/reorder/toggle components on pages)
- `ad-rules.js` — ad-injection rules for inline content ads
- `banners.js` — promotional banners, GEO-targeted
- `faqs.js` — `searchFAQs`
- `nav.js` — see above

**Users / Access**
- `users.js` — session creation/lookup, `getUserByEmail`
- `permissions.js` — role → resource → action matrix (`getPermissionMatrix`, `checkPermission`)
- `item-access.js` (474 lines) — **item-level** access control layered on top of role permissions: per-user default scope, explicit item assignment/unassignment, `getAccessibleWhereClause` for scoping list queries to what a given user can see. This is the backbone of the admin dashboard's multi-editor safety.
- `item-access-api.js` — HTTP handlers wrapping `item-access.js` for the dashboard UI
- `admin_tools.js` — user role management, broadcast/targeted notifications
- `user_dashboard.js` — end-user-facing features: bookmarks, inquiries, notifications, casino submissions, profile updates
- `audit.js` — `logAudit`/`getAuditLog`, written to by admin mutation endpoints

**Media**
- `media.js`, `media_library.js`, `media_folders.js` — R2-backed media library with folder tree, search, and CRUD (two overlapping modules — `media_library.js` is the actively-used, more complete one)

**AI**
- `ai.js` — `logAIGeneration`, usage logging for the AI content-generation tools

**Affiliate / Monetization** — see [Affiliate, Offers & Tracking](#affiliate-offers--tracking)

**Analytics / Reporting** — see [Analytics, Reporting & Alerts](#analytics-reporting--alerts)

**Postback / Imports** — see [Conversion Postback / Import / Adapters](#conversion-postback--import--adapters)

**Stats**
- `stats.js` — dashboard overview numbers (`getOverview`, `getCountries`, `getTopCasinos`)

### Auth & Access Control

- **`worker/auth.js`** — password hashing (PBKDF2-style via
  `hashPassword`/`verifyPassword`), session token generation, cookie
  handling, `login`/`logout`/`register`, `getCurrentUser` (resolves the
  session cookie → user row on every request), `requireAuth`/
  `requireRole` middleware helpers.
- **Item-level access** (`database/item-access.js`) layers on top of
  simple role checks: a user's effective access to a *specific*
  casino/review/etc. can be narrower or broader than their role's
  default, via explicit assignment (`assignItem`/`unassignItem`) or a
  configurable system/user default scope. `getAccessibleWhereClause`
  is used throughout the admin list endpoints so a scoped editor only
  ever sees rows they're allowed to.
- **`worker/item-access-test.js`** exercises this system end-to-end as
  an in-Worker regression check (also covered by the `node:test` suite
  under `en/test/`).

### Admin / Content API (`api.js`)

**`worker/api.js`** (4,367 lines, single `handleAPI(request, env, user)`
entry point) is the browser-session-authenticated REST API backing the
entire admin dashboard: full CRUD for every content type, settings,
users, permissions, item-access, media, components, nav, banners, ad
rules, affiliate entities, offers, tracking links, postback configs,
provider adapters, analytics/reports/campaigns/alerts, and AI tool
invocations. This is distinct from:
- the **Super API** (`worker/super/`) — machine-to-machine, HMAC-signed, used by the control plane
- the **Lummet admin API** (`worker/lummet/admin-api.js`) — a separate, smaller API for the AI-assistant's own bulk-content tools

### AI Assistant

Two distinct AI surfaces exist in this codebase — **do not confuse
them**:

1. **Public AI assistant** (`worker/ai.js` + `worker/ai/*`) — a
   customer-facing chat assistant embedded in the tenant site (and
   given its own subdomain routing via `worker/lummet/router.js` +
   `en/lummet/index.html`).
   - `ai.js` (`aiEngine`) — top-level orchestration object
   - `ai/router.js` — lightweight intent detection (`detectIntent`,
     `extractEntities`) from the user's message
   - `ai/understand.js` — builds a preliminary "understanding" prompt/pass
   - `ai/retrieval.js` (670 lines) — RAG-style retrieval over site
     content (`retrieve`, `buildContextString`) so answers can cite
     real casinos/reviews/offers
   - `ai/prompt.js` — final system-prompt + message assembly
   - `ai/assistant.js` — `chat`/`chatStream`, the actual model call
   - `ai/memory.js` — conversation history persistence and expiry
     cleanup
   - `ai/security.js` — input validation, prompt-injection detection,
     IP hashing + rate limiting
   - `ai/context.js`, `ai/search.js` — supporting context-building and
     search helpers
   - `ai/api.js` — HTTP handlers (`handleChat`, `handleChatStream`,
     `handleClearChat`)
2. **Admin AI content tools** (`worker/ai/admin-tools.js`) —
   editor-facing generation helpers used from the dashboard: draft a
   review (`generateReview`), SEO copy (`generateSeo`), FAQs
   (`generateFAQs`), schema.org JSON-LD (`generateSchema`), content
   outlines (`generateOutline`), readability/tone rewrites
   (`improveContent`), and internal-linking suggestions
   (`suggestInternalLinks`). Invoked via `api.js` and logged through
   `database/ai.js`.

### Affiliate, Offers & Tracking

- **`database/affiliate-partners.js`** — affiliate network/brand
  partners (the companies you have deals with)
- **`database/affiliate-programs.js`** — specific programs under a
  partner, with casino associations (`setProgramCasinos`)
- **`database/affiliate-accounts.js`** — your account within a program
- **`database/affiliate-commercial-terms.js`** — commission terms
  (CPA/RevShare/hybrid) with date-ranged versioning and overlap
  prevention (`findOverlappingActiveTerm`, `resolveApplicableTerm`,
  `calculateCommission`)
- **`database/offers.js`** — bonus offers with a formal status
  state-machine (`assertValidTransition`, `transitionOfferStatus`),
  version history, and "as of date" lookups for historical accuracy
- **`worker/offers/selection.js`** — runtime offer resolution:
  `resolveOfferForCasino`/`resolveOffersForCasinos` pick the correct,
  currently-active offer for a casino + country at render time
- **`database/tracking-links.js`** — trackable redirect links with
  per-GEO destination overrides, custom tracking codes, health status
- **`worker/tracking/redirect.js`** — resolves `/en/go/:slug` to the
  right destination URL for the visitor's country
- **`worker/tracking/health-check.js`** — periodic liveness checks on
  tracking-link destinations (`checkTrackingLinkHealth`,
  `runScheduledHealthChecks`)
- **`database/clicks.js`** — click logging (`logClick`) that
  originates the `click_id` used for conversion attribution

### Conversion Postback / Import / Adapters

Universal server-to-server conversion ingestion feeding the same
attribution/commission pipeline as everything else in Analytics. Full
reference: `en/docs/postback-api.md`.

- **`worker/postback/handler.js`** — `POST`/`GET
  /api/v1/conversions/postback/:endpoint_token`, the live S2S endpoint
- **`worker/postback/auth.js`** — per-integration authentication:
  HMAC, shared-secret, API-key, or signed-query, plus IP allowlisting
  (`checkIpAllowlist`, `verifyPostbackAuth`)
- **`worker/postback/field-mapping.js`** — configurable field aliasing
  so different networks' payload shapes normalize to one internal
  schema (`normalizeConversionPayload`)
- **`worker/postback/ingest.js`** — the shared ingestion pipeline
  (dedup, attribution, commission calculation) used by postback,
  import, and adapter sync alike
- **`worker/postback/logging.js`** — `logPostbackAttempt`, every
  inbound request logged regardless of success
- **`worker/imports/parse.js`** — CSV/JSON parsing
  (`parseCsv`/`parseJsonRows`)
- **`worker/imports/pipeline.js`** — `importConversionReport`, batch
  import through the same `ingest.js` pipeline, with per-row error
  reporting (`database/import-batches.js` tracks batch metadata)
- **`worker/adapters/base.js`** — `BaseAffiliateProvider`, the
  interface a real network-specific adapter would implement
- **`worker/adapters/generic-rest-adapter.js`** — the only adapter
  that ships: a configurable generic REST puller (no network-specific
  adapter is faked without that network's real documented API)
- **`worker/adapters/registry.js`** / **`sync.js`** — adapter lookup
  and scheduled sync orchestration (`syncAllDueProviders`)
- **`database/provider-adapters.js`** — adapter configuration CRUD
  and sync-status tracking

### Analytics, Reporting & Alerts

Built on top of the item-access/RBAC model — every analytics query is
scoped to what the requesting user can see, same as the rest of the
dashboard.

- **`database/analytics.js`** (537 lines) — event logging (`logEvent`,
  fired non-blocking via `ctx.waitUntil` for CASINO_VIEW/OFFER_VIEW/
  BANNER_VIEW/etc.), KPI math (`computeKpis`, `safeDivide`),
  dimension/time-series/GEO performance breakdowns, conversion
  recording (`recordConversion`, looks up the applicable commercial
  term), and `aggregateAnalyticsDaily` for the scheduled rollup.
- **`database/reports.js`** (1,003 lines) — 17 report types, CSV/HTML/
  JSON export, column selection with grouping/subtotals
  (`runReport`, `toCsv`, `toHtml`), scheduled report execution
  (`executeReportRun`, `runDueReportSchedules`). Includes
  `reconciliation` (compares this platform's own calculated commission
  against imported/statement `reported_commission`, never fabricating
  a match with no statement imported), `cohort_analysis`, and
  `ltv_analysis` (keyed by optional `external_player_id`).
- **`database/alerts.js`** — threshold-based alert rules on any KPI
  metric, scoped to a dimension, with comparison-window evaluation
  (`evaluateAlertRules`) and acknowledgment tracking.
- **`database/campaigns.js`** — UTM campaign CRUD for attributing
  traffic sources.
- **`worker/reports/delivery.js`** — email delivery of scheduled
  reports via Resend (`RESEND_API_KEY`/`RESEND_FROM_EMAIL` secrets);
  fails loudly to the audit log rather than silently if unconfigured.
- Dashboard: `/en/dashboard/analytics`, `/campaigns`, `/reports`.
- Scheduled jobs are **off by default per tenant** — enabled via
  `system_settings` keys (`analytics_aggregation_cron_enabled`,
  `report_schedules_cron_enabled`, `alert_rules_cron_enabled`).

### Super API (`worker/super/`)

Machine-to-machine, HMAC-signed administrative API used exclusively by
`lummet-control-plane`. Full reference: `en/docs/super-api.md`.

- **`super/router.js`** — `handleSuperApi(request, env, ctx, path)`,
  entry point mounted at `/en/api/super/*`
- **`super/auth.js`** — `verifySuperApiRequest` (HMAC signature
  verification against a Worker secret), `logSuperApiRequest`
- **`super/capabilities.js`** — `SUPER_API_VERSION` (currently 9) and
  the `CAPABILITIES` manifest the control plane queries to know what a
  given tenant version supports
- **`super/handlers.js`** (1,120 lines) — full CRUD over casinos,
  reviews, news, pages, categories, countries, authors, media, users,
  settings, components, review blocks, ad rules, nav items, banners,
  platform updates, SEO pages, and permissions — the bulk content-sync
  surface
- **`super/handlers-affiliate.js`** — partners/programs/accounts/
  commercial-terms/offers/tracking-links via Super API
- **`super/handlers-analytics.js`** — tenant-wide aggregate analytics
  (overview, revenue, tracking health) for control-plane dashboards
- **`super/handlers-reporting.js`** — reports/campaigns/alerts via
  Super API

### Media

- **`worker/media-upload.js`** — file validation (`validateFile`), R2
  key generation, public URL + thumbnail URL construction, upload/
  delete/serve handlers. Backed by `database/media_library.js` and
  `database/media_folders.js`.

### Cron / Scheduled Jobs

**`worker/cron.js`** — `cleanupExpiredSessions`,
`runAnalyticsAggregation`, `runScheduledReports`, `runAlertEvaluation`,
`runProviderSync`. Wired to the Worker's `scheduled()` handler when a
`triggers.crons` block is active in `wrangler.jsonc` (currently
commented out per-tenant — each job additionally gates itself on its
own `system_settings` flag, so re-enabling the trigger is safe and
additive).

### Templates

`en/templates/` — a small custom templating layer (see `render.js`):
plain HTML files with `{{variable}}` placeholders and a few structural
markers (`{{HEADER}}`, `{{FOOTER}}`, component injection points).

- `templates/layout/` — `base.html` (outer shell), `header.html`,
  `footer.html`, `sidebar.html`, `admin-nav.html`
- `templates/pages/` — one file per public page type (`home.html`,
  `casino.html`, `review.html`, `news.html`, `country.html`,
  `category.html`, `seo-landing.html`, `sitemap.html`, `404.html`,
  etc.) plus `templates/pages/admin/` (38 dashboard page templates)
  and `templates/pages/users/` (end-user account pages)
- `templates/components/` — one file per pluggable component type
  used by `component-engine.js`: `banner.html`, `bonus-box.html`,
  `casino-card.html`, `casino_grid.html`, `comparison_table.html`,
  `cta.html`, `faq_group.html`, `hero.html`, `html.html`,
  `news_feed.html`, `review-block.html`, `review-box.html`,
  `seo-box.html`, `text.html`, `breadcrumbs.html`, `author.html`

### Static Assets

`en/static/` — `css/`, `js/` (admin dashboard JS: `admin.js`,
`dashboard.js`, `casino-admin.js`, etc.), `images/` (including
`images/logo/`). Served via the Worker Assets binding (`ASSETS`,
`run_worker_first: true` in `wrangler.jsonc`), meaning the Worker sees
every request first and can decide to serve an asset or render
dynamically.

### Migrations (lummet-tenant)

`en/migrations/` — 36 sequential SQL migrations (`0002` → `0037`) plus
a consolidated `schema.sql`. No automated migration-tracking table is
configured; migrations are applied manually, in order, per tenant, via
`wrangler d1 execute` (see [Integration commands](#integration--setup-commands)).

Notable recent ones: `0026` country directory tiers, `0027`–`0032`
analytics/reporting/alerting, `0033`–`0036` postback/import/
reconciliation/adapters/player-LTV, `0037` `seo_keywords` across
content types (casinos, reviews, news, pages, updates, countries,
categories, seo_pages).

---

## Repository 2: `lummet-control-plane`

```
lummet-control-plane/
├── worker/
│   ├── index.js          # Entry point (1,693 lines) — routes admin dashboard + API
│   ├── auth.js            # Lummet's OWN admin identity system (PBKDF2 + session cookies)
│   ├── registry.js        # Tenant CRUD, credential issuance/rotation, connection testing
│   ├── client.js          # The ONLY place this repo calls a tenant (requestTenant)
│   ├── signing.js         # Builds HMAC-signed headers matching tenant's super/auth.js
│   ├── crypto.js          # AES-GCM encrypt/decrypt for tenant secrets at rest
│   ├── rbac.js             # Area/resource/action permission model for Lummet admins
│   ├── cms.js / cms-resources.js   # Control-plane's own lightweight CMS (public site content)
│   ├── data.js             # Shared low-level D1 reads (tenant rows, active credential)
│   ├── resources.js        # Resource registry for the admin UI
│   ├── public-brands.js    # Static list of publicly-listed brands
│   ├── audit.js            # Control-plane-side audit log
│   ├── cron.js              # pruneOldAuditLogs, runHealthChecks (not wired to a Cron Trigger on Free plan — see wrangler.jsonc comment)
│   └── views/               # layout.js (shared shell) + views/pages/* (login, dashboard, tenants, platform, placeholder)
├── migrations/
│   ├── 0001_control_plane.sql       # tenant registry, encrypted credentials, lummet_admins/sessions
│   ├── 0002_lummet_cms.sql           # control plane's own public-site CMS content
│   ├── 0003_lummet_admin_rbac.sql    # area/resource/action permission tables
│   └── 0004_lummet_homepage_sections.sql
├── wrangler.jsonc
└── DEPLOYMENT.md              # Full end-to-end deployment guide (read this before deploying)
```

Key architectural rule enforced throughout this repo: **it never
queries a tenant's D1 directly.** Every tenant interaction goes through
`worker/client.js`'s `requestTenant()`, which looks up and decrypts
the tenant's credential (`crypto.js`), signs the request identically
to what the tenant's `worker/super/auth.js` expects (`signing.js`),
and normalizes every failure mode (401/403/404/409/422/429/500/502/504
— distinguishing a real timeout from a connection failure).

- **`auth.js`** — completely separate login/session system from any
  tenant's users; includes first-admin bootstrap
  (`bootstrapFirstAdmin`) and standard admin management (role/status/
  password changes, `countSuperAdmins` guard against locking yourself
  out).
- **`registry.js`** — `listTenants`, `createTenant`, `updateTenant`,
  `setTenantStatus`, `deleteTenant`, `rotateCredential`,
  `revokeCredential`, `testConnection` (routes through `client.js`),
  `getTenantCapabilities`/`getTenantHealth`.
- **`rbac.js`** — three areas (`tenant`, `cms`, `platform`) × four
  actions (create/read/update/delete), plus per-admin tenant-access
  scoping (`canAccessTenant`, `listAccessibleTenants`) so a
  non-super-admin can be restricted to specific tenants.
- **`views/`** — server-rendered admin UI, deliberately distinct
  visual identity from any tenant's dashboard to avoid confusion
  between "managing the platform" and "managing a brand."

For full deployment steps (both halves — control plane and tenant-side
Super API — end-to-end, plus rollback), see
`lummet-control-plane/DEPLOYMENT.md`.

---

## Multi-Tenant Deployment Model

`lummet-tenant/wrangler.jsonc` defines one default environment
(`freewin`) and an `env` block with six additional named environments,
each pointing at its own D1 database, KV namespace, and R2 bucket —
**same codebase, isolated data per brand**:

| Environment | D1 database | KV namespace binding | R2 bucket |
|---|---|---|---|
| *(default)* `freewin` | `freewin-db` | `CACHE` | `freewin-media` |
| `lummet` | `lummet-db` | `CACHE` | `lummet-media` |
| `levelcasino` | `levelcasino-db` | `CACHE` | `level-casino-media` |
| `clustercasino` | `clustercasino-db` | `CACHE` | `cluster-casino-media` |
| `neuroodds` | `neuroodds-db` | `CACHE` | `neuroodds-media` |
| `legendodds` | `legendodds-db` | `CACHE` | `legendodds-media` |
| `brilliantodds` | `brilliantodds-db` | `CACHE` | `brilliantodds-media` |

All environments also share: `ASSETS` (static files from `./en`,
`run_worker_first: true`), `AI` (Workers AI binding), `DB` (D1
binding name — same binding name, different underlying database per
env). Cron triggers are currently commented out at the top level
(each scheduled job separately gates on its own `system_settings`
flag, so this is safe to re-enable per tenant later).

Deploying a specific brand: `wrangler deploy --env <name>` (or no
`--env` flag for the default `freewin`). See
[Integration commands](#integration--setup-commands) below.

---

## Recent Changes

Summary of the most recent work integrated into this codebase (see git
log for exact commits):

1. **Sitemap draft-leak fix** (`worker/sitemap.js`) — the `countries`
   and `categories` sitemap queries had no `published`/`status`
   filter, unlike every other content type, so draft/unpublished
   countries and categories were appearing in `/sitemap.xml`. Both now
   filter `WHERE published = 1 AND status != 'draft'`.
2. **Performance: parallelized page rendering** (`controllers.js`,
   `render.js`, `component-engine.js`) — nearly every public-page
   controller (`renderHome`, `renderCasino`, `renderReview`,
   `renderNews`, `renderCountry`, `renderCategory`, the SEO landing
   pages, all list pages, `renderAuthor`, `renderUpdate`) previously
   fired its independent DB/KV/template lookups one `await` at a time;
   they now use `Promise.all()` so page load time is roughly the
   *slowest single lookup* instead of the *sum of all of them*. Along
   the way this also fixed a genuine bug: `renderReview` was fetching
   the same casino row from D1 **twice** per request. The
   component-rendering engine (`renderAllInjectionPoints`/
   `renderPageComponents`, which runs on every page, once per
   component) now renders every component concurrently instead of one
   at a time. `Renderer.loadTemplate()` gained a per-request cache
   (previously re-fetched the same template asset from Workers Assets
   on every single call, including duplicates within one page render).
3. **`seo_keywords` feature** (`0037_content_seo_keywords.sql` +
   `api.js`, `database/*.js`, `controllers.js`, admin templates) — a
   new `seo_keywords` field added across casinos, reviews, news,
   pages, updates, countries, categories, and seo_pages, exposed in
   admin forms, the DB layer, and rendered output.

These three changes landed independently and merge cleanly — the perf
work and the `seo_keywords` feature touch different regions of the
shared files with zero overlap.

---

## Integration / Setup Commands

### Prerequisites

```bash
# Node 22.5+ (engines requirement in package.json)
node --version

# Cloudflare Wrangler CLI (per-repo devDependency isn't committed;
# install globally or use npx)
npm install -g wrangler
wrangler --version
wrangler login
```

### `lummet-tenant` — first-time setup for a new brand environment

```bash
cd lummet-tenant

# 1. Create the D1 database
wrangler d1 create <brandname>-db
# → copy the returned database_id into wrangler.jsonc under env.<brandname>.d1_databases

# 2. Create the KV namespace
wrangler kv namespace create CACHE
# → copy the returned id into wrangler.jsonc under env.<brandname>.kv_namespaces

# 3. Create the R2 bucket
wrangler r2 bucket create <brandname>-media
# → set bucket_name in wrangler.jsonc under env.<brandname>.r2_buckets

# 4. Apply the full schema, then every migration in order
wrangler d1 execute <brandname>-db --remote --file=en/migrations/schema.sql
for f in en/migrations/00*.sql; do
  echo "Applying $f"
  wrangler d1 execute <brandname>-db --remote --file="$f"
done

# 5. Bootstrap the first admin user (one-time)
#    createAdminUser() in worker/bootstrap.js is normally invoked via
#    a one-off admin script/endpoint — check current wiring before
#    relying on a specific invocation path.

# 6. Set required secrets (per environment)
wrangler secret put RESEND_API_KEY --env <brandname>      # scheduled report email delivery
wrangler secret put RESEND_FROM_EMAIL --env <brandname>
# add any Super API HMAC shared secret expected by worker/super/auth.js

# 7. Local dev server
wrangler dev --env <brandname>

# 8. Deploy
wrangler deploy --env <brandname>
# (omit --env for the default `freewin` environment)
```

### `lummet-tenant` — day-to-day (existing environment)

```bash
cd lummet-tenant

# Apply a NEW migration to an existing tenant (repeat per tenant/env — no automated migration tracking)
wrangler d1 execute <brandname>-db --remote --file=en/migrations/00NN_description.sql

# Run the test suite (zero external deps — Node's built-in test runner + sqlite)
cd en && npm test

# Local dev
wrangler dev --env <brandname>

# Deploy
wrangler deploy --env <brandname>
```

### `lummet-control-plane` — setup

```bash
cd lummet-control-plane

# 1. Create the control-plane D1 database
wrangler d1 create lummet-control-plane-db
# → copy database_id into wrangler.jsonc

# 2. Apply migrations in order
for f in migrations/000*.sql; do
  echo "Applying $f"
  wrangler d1 execute lummet-control-plane-db --remote --file="$f"
done

# 3. Set the credential encryption key (32-byte AES-GCM key, base64-encoded)
wrangler secret put CREDENTIAL_KEK
# generate one, e.g.: openssl rand -base64 32

# 4. Local dev
wrangler dev

# 5. Deploy
wrangler deploy
```

Then, in the control-plane admin UI: bootstrap the first Lummet admin
(shown automatically on first visit when `lummet_admins` is empty),
add each tenant (issues an HMAC credential shown exactly once — store
it), and set the matching secret on the tenant side so
`worker/super/auth.js` can verify signed requests from the control
plane. See `lummet-control-plane/DEPLOYMENT.md` for the full,
authoritative walkthrough including rollback steps.

### Syncing local changes into a working tree (as used in this session)

```bash
SRC=<path to updated export>
DEST=<path to your working repo>

# See exactly what differs (no changes made)
diff -rq --exclude=.git "$SRC/lummet-tenant" "$DEST/lummet-tenant"

# Dry-run a full sync to preview (still no changes made)
rsync -avnc --exclude='.git' "$SRC/lummet-tenant/" "$DEST/lummet-tenant/"

# Copy only specific reviewed files
cp -v "$SRC/lummet-tenant/en/worker/<file>.js" "$DEST/lummet-tenant/en/worker/<file>.js"

# Syntax-check before committing
node --check "$DEST/lummet-tenant/en/worker/<file>.js"

# Review, stage, commit
cd "$DEST/lummet-tenant"
git status
git diff -- en/worker/<file>.js
git add en/worker/<file>.js
git commit -m "description"
git push
```

Never use `rsync --delete` when syncing from an export into a live
working tree — it would remove anything present in `DEST` but absent
from `SRC`.
