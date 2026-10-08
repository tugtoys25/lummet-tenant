# Lummet AI — public access, 3-free-messages gate, and data coverage

This patch extends the existing Lummet AI assistant (`en/worker/ai/*`) rather
than rebuilding it — it was already a solid two-pass RAG system (understand →
retrieve → respond) with geo-awareness and conversation memory. What was
missing/broken against the request is listed below.

## 1. Free-tier gate: 3 free messages, then register/login

- New table `ai_free_tier_usage` (migration `en/migrations/0043_ai_free_tier_usage.sql`,
  mirrored in `en/worker/database/schema-lummet.sql`), keyed by hashed IP
  (same `hashIP()` already used for the existing rate limiter) so clearing
  browser storage doesn't reset the count.
- `en/worker/ai/security.js`: `FREE_MESSAGE_LIMIT = 3`,
  `getFreeMessageUsage()`, `consumeFreeMessage()`.
- `en/worker/ai/assistant.js`: both `chat()` and `chatStream()` check the
  quota *before* calling `understand()`/`retrieve()`/the model, so a blocked
  request costs nothing. Once exhausted, the response is
  `{ intent: 'auth_required', requiresAuth: true, authLinks: { register, login } }`
  (an `auth_required` SSE event in the streaming case) instead of an answer.
  Logged-in requests (`userId` present) never hit this check — unlimited, as
  requested.
- Every normal answer now also carries `freeMessagesRemaining` (anonymous
  only) so the widget can show a live counter.

## 2. Bug fix: anonymous streaming/clear were 401-ing

`en/worker/api.js` only exempted `/api/v1/ai/chat` from its
"logged in or 401" check. `/api/v1/ai/chat/stream` and `/api/v1/ai/chat/clear`
were not exempted, so anonymous visitors were silently failing the streaming
call every time and falling back to the slower non-streaming endpoint. Fixed
by exempting all three public AI paths; gating now happens inside the
assistant, not the router.

## 3. Continuation into the registered account / dashboard

- `en/static/js/lummet-ai.js` now persists `session_id` in `localStorage`
  instead of regenerating it every page load.
- Because `worker/ai/memory.js`'s `appendMessages()` already attaches
  `user_id` to the `ai_conversations` row (`COALESCE(?, user_id)`), simply
  reusing the same `session_id` before and after login means the
  conversation continues automatically — no migration/merge step needed.
- The widget's auth-gate CTA links to `/en/register` and `/en/login` with
  `?redirect=<current page>`; `en/static/js/main.js`'s login/register submit
  handlers now honor that param (falls back to the previous hardcoded
  `/en/dashboard` / `/en/login` behavior if absent). The redirect param is
  also carried across the Login ⇄ Register cross-links
  (`templates/pages/login.html`, `register.html`).
- A `lummet_ai_reopen` localStorage flag is set right before navigating to
  register/login and consumed on the next page load to auto-reopen the
  widget, so the "continuation" is visible, not just functional.
- Also fixed a pre-existing bug in `lummet-ai.js`: `clearConversation()`
  referenced `siteHostname`, which was scoped inside `init()` and would
  throw a `ReferenceError` when clearing chat. Hoisted to module scope.

## 4. Data coverage: payment methods, navigation, homepage sections

`en/worker/ai/retrieval.js` (+ `buildContextString`) and
`en/worker/ai/understand.js` (schema description + table whitelist) now also
cover:

- `payment_methods` (standalone `/payment-methods/:slug` pages) joined to
  casinos via `casino_payment_methods`, so "does X accept PayPal" and
  casino listings both surface accepted payment methods.
- `nav_items` — the live site menu/navigation structure.
- `components` / `page_components` — homepage sections (`page_type =
  'homepage'`), the same join pattern the component engine
  (`worker/component-engine.js`) already uses to render the homepage.

These join the existing coverage (casinos, reviews, review_blocks, news,
platform_updates, pages, faqs, authors, countries, categories, seo_meta,
geo_rules, casino_categories).

## Deploy steps

```bash
cd en
wrangler d1 migrations apply <DB_NAME> --remote   # applies 0043_ai_free_tier_usage.sql
wrangler deploy
```

(No changes to `wrangler.toml` / bindings are needed — everything uses the
existing `env.DB` and `env.AI` bindings.)

## Known limitations / things not done

- **Shared IPs**: the free-tier counter is per hashed IP. Visitors behind
  the same NAT/corporate network/mobile carrier share a quota. This mirrors
  the existing `ai_rate_limits` design in the codebase; a stricter
  per-account or per-device scheme would need something like a signed
  anonymous device cookie instead.
- No admin-facing dashboard/report for free-tier usage was added (the
  `ai_free_tier_usage` table is queryable directly, or a small admin page
  could be added on top of it) — flag if you want this.
- Didn't extend retrieval to every remaining joined table in the schema
  (offers, affiliate programs/partners, tracking links, etc.) — those are
  mostly internal/affiliate-facing rather than public-facing content, so
  left out of the public assistant's scope. Say the word if any of those
  should be chat-visible too.
