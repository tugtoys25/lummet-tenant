# Lummet AI: what the site is about, and the chat widget switch

AI Studio > **Chat widget** (admins only) has three settings, stored in the `settings` table (no migration):

| Key | Values | Default |
| --- | --- | --- |
| `ai_widget_enabled` | `1` shown, `0` hidden | shown |
| `ai_chat_topic` | `auto`, `casino`, `general` | `auto` |
| `ai_chat_about` | up to 300 characters | empty |

* **casino** wording is the original text, unchanged (prompt, canned replies, widget, `lummet.` page).
* **general** wording is neutral: no casino, bonus or gambling text; the SITE SECTIONS links list only sections the site has switched on; the owner's "about" text is added to the prompt.
* **auto** picks casino while the site profile has `casino`, `content.sportsbook` or `content.partners` on, otherwise general. Full-platform sites therefore do not change.
* Hiding the widget removes only the floating button on public pages. The `lummet.` page, conversations and every setting are kept.
* Everything fails open: a missing table or a failed request means casino wording and a visible widget.

Code: `worker/ai/site-topic.js` (settings, resolver, wording), `worker/ai/prompt.js` (general prompt), `GET /api/v1/ai/widget-config` (public, read-only), `js-src/lummet-ai/*`, `lummet/index.html` (`{{ai_*}}` tokens filled by `worker/lummet/router.js`). Rebuild scripts with `node scripts/build-js.mjs && node scripts/asset-version.mjs`.
