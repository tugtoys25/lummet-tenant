# 1x tenant code merged into the 1y SaaS tenant

- en/ code, templates, static assets, tests and docs come from the 1x line (v22.60). en/migrations and wrangler/workflows/release tooling stay from 1y.
- New migration: en/migrations/0004_ai_history_feedback_perf.sql (ai_studio_history, ai_feedback, perf_samples). Re-runnable.
- Re-applied 1y hardening: SETUP_TOKEN guard on /api/v1/setup/admin (en/worker/api/public.js), optional Turnstile (worker/auth/security.js, static/js/main.js, login/register templates), atomic super-API nonce (worker/super/auth.js), case-insensitive email login (database/users.js), quoted test glob (en/package.json).
- Removed superseded single-file scripts static/js/admin.js and static/js/dashboard.js (served from parts in 1x).
- Tests adapted to the baseline migration layout (migrations.test.js rewritten; others point at 0001/0002/0004). Full suite: 1371 pass, 0 fail.
- Not carried over: 1x wrangler.jsonc / wrangler.account2.jsonc and its brand-specific deploy workflows.
- Orphaned 1y-only files (backups, seo.js, bootstrap.js, ai/context.js, ai/search.js, etc.) were left in place, untouched.
