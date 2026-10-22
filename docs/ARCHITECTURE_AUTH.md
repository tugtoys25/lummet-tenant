# Authentication (worker/auth.js, worker/auth/)

`auth.js` (622 lines) is now a facade over four parts. It re-exports the same 12 names, so every importer (`controllers/user-pages.js`, `controllers/dashboard.js`, `app/routes/services.js`, `super/router.js`, `api/public.js` and the API routes) is unchanged. The helpers that only the parts use (`verifyTurnstile`, `checkRateLimit`, `sha256Hex`...) are exported from `auth/security.js` and are not part of the public API.

| Part | Lines | Holds |
|---|---:|---|
| `auth/security.js` | 104 | Turnstile check, the brute-force limiter (5 failures per IP and action in 15 minutes), IP hashing, SHA-256 hex, one-time tokens, cookie domain and the session cookie header |
| `auth/password.js` | 93 | `hashPassword` and `verifyPassword`: PBKDF2, 100,000 iterations, SHA-256; the legacy unsalted SHA-256 form is still accepted (login upgrades it) |
| `auth/session.js` | 219 | `generateSessionToken`, `login`, `logout`, `getCurrentUser`, `requireRole`, `getCookie`, the `json` helper |
| `auth/account.js` | 190 | `register`, `forgotPassword`, `resetPassword`, `changePassword` |

Dependencies: `security` and `password` import nothing from the folder; `session` imports both; `account` imports all three. `test/auth-structure.test.js` checks this and that the hashing and rate-limit settings stay in one place each.
