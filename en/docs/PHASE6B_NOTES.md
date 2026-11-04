# Phase 6B notes

Run on D1, in order, once per tenant database: `migrations/0009_config_versions.sql`, then `migrations/0010_config_immutability.sql`.
Both are safe to run twice. Without 0009 the site keeps working and saves apply straight to live.

## What 6B changed
- Draft preview now reaches the two public pages that read a setting directly: the news in-article ad label (`news_inline_ad`) and the country list's featured label. They use `getSettingForRequest`, which prefers the draft value only while a signed-in editor is previewing.
- 0010 adds database triggers: the audit log cannot be edited or deleted, and a published version's document cannot be rewritten.
- Tests tightened: the publish-time validation test now proves a bad merge is refused (422, nothing written, no new version, draft kept); the diff test names the exact change; a tautological preview assertion was removed.
- Full suite run on the packaged tree.

## Not done
- The Configuration screen was not opened in a real browser. Try autosave, publish, restore and preview once on a test tenant.
- The Configuration screen is still admin-only, so editors and viewers cannot reach their roles yet.
