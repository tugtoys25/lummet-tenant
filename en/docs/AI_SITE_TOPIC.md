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

## Responsible-gambling content

* `footer_rg_mode` (Settings > Responsible gambling): `auto` (default), `show`, `hide`. Auto shows the footer's 18+ and licence logos, message and help links while the site has a casino, sportsbook or partner section on, and hides them on other sites. The footer disclaimer and the GPWA seal are not affected. Nothing is deleted when hidden.
* The message, link and help-line fields are now editable on every site (they used to be hidden unless the casino section was on).
* `ai_chat_rg` (AI Studio > Chat widget): `auto` follows `footer_rg_mode`, which follows the site type; `show` or `hide` overrides it for the chat only (the 18+ note, the responsible-gambling link in the prompt and sections list, suggestion cards, the `lummet.` page hint).
* The chat's responsible-gambling link now uses the address saved in Settings (`footer_responsible_url`) instead of a fixed one.
* On a general site the model also gets a SITE FACTS block (name, address, tagline, about text, sections), and leftover casino or gambling rows (starter FAQs, homepage blurbs, old pages) are dropped from what it is shown.
