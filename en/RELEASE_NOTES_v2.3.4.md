# Tenant worker v2.3.4

- Added additive tenant migration `0005_site_access_state.sql`.
- Added HMAC Super API endpoint `PUT /en/api/super/site-access-state` for signed, generation-ordered site access state.
- Added top-level gate that returns a neutral unavailable page for fresh suspended/closed state, gates public API requests too, and fails open for missing/invalid/stale/unreadable state.
- Kept the Super API reachable so a suspended site can be restored.
- Updated newsroom discovery SQL to use positional placeholders supported by the SQLite test shim; updated Super API route/handler fixtures for the new route.
- `npm test` isolates test files and writes per-file timing output.

Status: staging candidate only; remote tenant deployment and end-to-end signed push verification remain open.
