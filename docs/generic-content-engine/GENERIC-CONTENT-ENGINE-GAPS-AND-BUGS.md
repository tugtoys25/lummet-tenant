# Generic Content Engine — Gaps & Bugs Audit

## STATUS UPDATE (pass 2 integration)

| # | Item | Status |
|---|------|--------|
| 1 | Delete custom types | ✅ fixed (409 while items depend on it) |
| 2 | Delete comparisons | ✅ fixed |
| 3 | Delete generic reviews / empty Actions column | ✅ delete + publish/unpublish + View; ⏳ full edit page not built |
| 4 | View link on content items | ✅ fixed (live items only) |
| 5 | Logo media picker | ⏳ open |
| 6 | Hero image media picker | ⏳ open |
| 7 | Tracking/affiliate URL for sportsbook | ⏳ open — needs a design decision (touches tracked links) |
| 8 | Raw-ID pickers | ◐ comparison **items** now searchable; **Editorial Pick** still a number input |
| 9 | Categories | ✅ fixed (read/write, admin checkboxes, used by related items) |
| 10 | GEO targeting | ✅ fixed (rules editor, list badges, detail status, related filter) |
| 11 | Sports / currencies / payment methods | ✅ fixed (write side + admin checkboxes) |
| 12 | Author on generic reviews | ✅ fixed (create form + update endpoint) |
| 13 | Review↔item linkage | n/a (pre-existing note) |
| 14 | Structured reviews | ⏳ open |
| 15 | Admin pagination | ⏳ open |
| 16 | License on public sportsbook page | ✅ fixed |
| — | Related items + caching, CONTENT_VIEW analytics (README "not built yet") | ✅ built |

Additional bugs found and fixed while doing the above: draft items/comparisons publicly
reachable, draft items leaking into published comparisons/reviews, unescaped names in
list cards, missing RBAC read gates, list endpoints ignoring item-level scoping,
`/generic-review/update` able to edit a **casino** review, orphaned relationship rows on
delete. See `CHANGES-pass2.md`.

---


**Scope:** `content_items` (sportsbook / affiliate_partner / custom), `custom_content_types`, `comparisons`, and generic `reviews` (`reviewed_content_type != casino`), as they stand after commit `70b622e` on `lummet-tenant`.

**Method:** every finding below was confirmed by reading the actual schema (`migrations/0051_generic_content_engine.sql`), the actual admin templates, the actual `worker/database/*.js` query code, and the actual `worker/controllers.js` render/route code — then cross-checked against the equivalent casino/casino-review code, which is the mature reference implementation in this codebase. Nothing here is inferred from documentation or test names; each item names the file(s) that prove it.

**Severity key:** 🔴 Critical (data loss / broken public page / security-relevant) · 🟠 High (feature unusable without raw SQL) · 🟡 Medium (inconsistent UX, workable with effort) · 🟢 Low (cosmetic / minor).

---

## 1. 🟠 No Delete for custom content types
**Evidence:** no route matching `custom-type.*delete` or `delete.*custom-type` exists in `worker/api.js` or `worker/routes.js`. `static/js/dashboard.js` (`loadCustomTypesTable`, ~line 456) renders only `View` and `Edit` buttons per row.
**Explanation:** once a custom content type (e.g. "Payment Provider") is created, there is no code path — UI or API — to remove it. The only way to delete one is a direct `DELETE FROM custom_content_types` in the D1 console, which also orphans its `custom_field_definitions` and `custom_field_values` rows since nothing cascades or cleans them up in application code.
**Fix:** add `deleteCustomContentType()` to `worker/database/custom-types.js`, a `/api/v1/custom-type/delete` route with admin-only permission (matching the create/update convention from migration `0051`), and a Delete button in the list template.

---

## 2. 🟠 No Delete for comparisons
**Evidence:** same search pattern (`comparison.*delete`) returns nothing in `worker/api.js`. `loadComparisonsTable` (~line 560) renders only `View` and `Edit`.
**Explanation:** identical shape to #1. A published comparison page can be edited but never removed except via raw SQL against `comparisons` and `comparison_items`.
**Fix:** mirror the casino review's delete pattern (`worker/api.js` ~line 2104) — check `item-access.canAccessItem(..., 'comparisons', 'delete', ...)`, then delete the comparison and its `comparison_items` rows in one call.

---

## 3. 🔴 No Delete for generic reviews — and the Actions column is empty
**Evidence:** `grep` for `generic-review.*delete` across `worker/api.js`, `worker/routes.js`, and `worker/database/generic-reviews.js` returns nothing. `static/js/dashboard.js` line ~990:
```js
<td class="table-actions"></td>
```
**Explanation:** this is the most severe of the three missing-delete cases because the Actions cell isn't just missing a button — it's rendered completely empty, with no Edit either, despite `/api/v1/generic-review/update` existing and working (confirmed by your own test run: `generic review create/update` suite, 6/6 passing). The update capability is built and tested, but there is no admin page that calls it, and no way to delete a generic review at all.
**Fix:** two separate fixes needed — (a) build a `dashboardGenericReviewEdit` route + edit template that POSTs to the existing `/api/v1/generic-review/update`, since the backend already supports this; (b) add a genuine delete endpoint + button, since none exists at any layer.

---

## 4. 🟡 Content-items list is missing "View"
**Evidence:** `static/js/dashboard.js` line ~314 renders only `Delete` and `Edit` for content items, while casino rows (line ~126), custom-type rows (~464), and comparison rows (~567) all render `View` + `Edit` (+ `Delete` where it exists).
**Explanation:** minor inconsistency, but real — an admin editing a sportsbook item has no one-click way to see the live page, unlike every other list in this UI.
**Fix:** build the correct public URL per `content_type` (`/en/sportsbook/{slug}`, `/en/affiliate-partner/{slug}`, or `/en/custom/{custom_type_slug}/{slug}`) and add the link.

---

## 5. 🟠 No logo field anywhere in the content-item form — despite full schema + read-path support
**Evidence:** `migrations/0051_generic_content_engine.sql` defines `logo_media_id INTEGER REFERENCES media_library(id)` on `content_items`. `worker/database/content-items.js` lines 13–14 and 35 already `LEFT JOIN media_library m ON m.id = ci.logo_media_id` to resolve it on read. But `templates/pages/admin/content-item-edit.html` and `content-item-create.html` contain **zero fields** referencing `logo_media_id`.
**Explanation:** this is a fully-wired read path with no write path. The column and the join exist and work; there is simply no way for a human to ever set the value through the product. It will be `NULL` forever unless someone runs SQL by hand.
**Fix:** add a media-picker field to both forms, wired to whatever media-library picker component the rest of the admin (news/pages) already uses.

---

## 6. 🟠 No featured/hero image field either
**Evidence:** same migration, `featured_image_media_id INTEGER REFERENCES media_library(id)`, same read-side JOIN in `content-items.js`, same absence from both forms.
**Explanation:** identical situation to #5, one column over. Sportsbook/affiliate-partner/custom items can never have a hero image through the UI.
**Fix:** same as #5 — one media-picker field per form.

---

## 7. 🔴 No tracking/affiliate link field for sportsbook items at all
**Evidence:** `templates/pages/admin/casino-edit.html` has a **required** field: `<input type="text" name="affiliate_url" required>` — this is the actual monetization link for every casino. `content-item-edit.html` and `content-item-create.html` have no equivalent field for `content_type = sportsbook`. The only related field on the whole form is, for `affiliate_partner` type only:
```html
<label>Linked Commercial Affiliate Partner ID (optional)
  <input type="number" name="linked_affiliate_partner_id">
</label>
```
**Explanation:** this is arguably the single biggest functional gap in the entire generic content engine for a monetization-driven site. A sportsbook item — the flagship new content type — has no way to carry a tracking/affiliate URL at all. The one adjacent mechanism that exists (`linked_affiliate_partner_id`) only applies to `affiliate_partner`-type items, and even there it's a raw integer ID input, not a URL field and not a picker (see #8).
**Fix:** either (a) add a direct `affiliate_url` / `tracking_url` column to `content_items` for sportsbook-type items, mirroring casino, or (b) extend the existing `linked_affiliate_partner_id` relationship to sportsbook too and pull the tracking URL from the linked `affiliate_partners` row — but either way, this needs a real field and a real UI path before sportsbook items can be monetized in production.

---

## 8. 🟡 "Item ID" pickers are raw number inputs everywhere they appear
**Evidence:** `templates/pages/admin/comparison-edit.html`:
```html
<input type="number" class="item-id" placeholder="Item ID">
...
<input type="number" name="editorial_selection_item_id">
```
Contrast with `templates/pages/admin/casino-edit.html`, which populates checkbox lists of real category/country/payment-method **names** with Select All / Clear All controls, and with `generic-review-create.html`, which *does* use a proper `<select id="reviewedItemSelect">` populated by name.
**Explanation:** to add an item to a comparison, or to set a comparison's "Editorial Pick," an admin must already know the internal auto-increment database ID of the casino/sportsbook/affiliate-partner/custom row they want — a number with zero connection to anything visible in the rest of the UI. This is the exact "only input IDs" pattern flagged in the audit request. It's inconsistent with the rest of this same codebase, which clearly knows how to build a proper picker (the review form proves it).
**Fix:** replace both raw number inputs with a type-aware `<select>` (or searchable autocomplete) populated from `/api/v1/content-items/list` / a casino list endpoint, the same pattern already used in `generic-review-create.html`'s `reviewedItemSelect`.

---

## 9. 🔴 Category assignment is completely unimplemented — schema exists, zero code touches it
**Evidence:** `migrations/0051_generic_content_engine.sql` creates:
```sql
CREATE TABLE IF NOT EXISTS content_categories ( ... );
```
with indexes. A repo-wide search for `content_categories` outside the migration file itself returns **zero results** — no read function, no write function, no API route, no admin field.
**Explanation:** this isn't a missing form field on top of working plumbing (like #5/#6) — it's a table that was designed and created but has no application code touching it at all, on either side. Casino has full category checkboxes (`casino-edit.html`) backed by working `casino_categories` logic; the generic equivalent doesn't exist beyond its `CREATE TABLE` statement.
**Fix:** this needs a full vertical slice — `getContentItemCategories()` / `setContentItemCategories()` in `content-items.js`, wiring into the create/update API handlers, and checkbox UI matching the casino pattern.

---

## 10. 🔴 Country/geo targeting is completely unimplemented — same story as #9
**Evidence:** same migration creates `content_geo` with indexes on `content_type`/`content_id` and `country_code`. Same repo-wide search: zero application code anywhere references `content_geo`.
**Explanation:** casino has a full allow/block country-targeting system (`geo_rules`, rendered as checkboxes with a mode selector in `casino-edit.html`, evaluated per-request via `evaluateCasinoGeo`). The generic content engine has an empty, unused table with the same intended purpose and nothing built on top of it — no way to restrict a sportsbook or custom item by country at all.
**Fix:** same shape as #9 — full vertical slice from DB functions through to the country-checkbox UI and a geo-evaluation call at render time (see `evaluateCasinoGeo` in `worker/controllers.js` as the pattern to follow).

---

## 11. 🟠 Sports / payment methods / currencies — half-built, and the code admits it
**Evidence:** migration `0051` also creates `content_sports`, `content_payment_methods`, `content_currencies`. Unlike #9/#10, `worker/database/content-items.js` **does** have read functions for all three (`getContentItemSports`, `getContentItemPaymentMethods`, `getContentItemCurrencies`, lines ~60–90). But a repo-wide search for `INSERT INTO content_sports`, `INSERT INTO content_payment_methods`, or `INSERT INTO content_currencies` returns **zero results** anywhere in `worker/`. The comment directly above the item-creation function in the same file says, verbatim:
> "Minimal write path -- enough for a future admin form or a seed script to use; the dashboard UI itself (Phase 25/67 of the original spec) is not part of Phase 3."
**Explanation:** this is the one case in the audit where the gap is self-documented by the original author rather than discovered — these three features were explicitly deferred, not accidentally missed. They can be displayed if a row is inserted by hand or by a future migration/seed script, but the product itself can never create that row.
**Fix:** build the missing `INSERT`/`UPDATE`/`DELETE` functions for all three join tables and add corresponding UI (checkbox groups, matching casino's payment-method pattern) to the content-item form.

---

## 12. 🟡 No author attribution for generic reviews — present for casino reviews
**Evidence:** `templates/pages/admin/reviews.html` line 24:
```html
<select name="author_id" id="reviewAuthorSelect">
  <option value="">No author assigned</option>
```
`templates/pages/admin/generic-review-create.html` — the full file was read — has no `author_id` field anywhere, despite writing to the same shared `reviews` table that has an `author_id` column used by the existing authors/byline system.
**Explanation:** a generic review can never display "Reviewed by [author name]" through the product, purely because the create form omits a field that already exists one table away and is fully functional for casino reviews.
**Fix:** add the same `<select name="author_id">` (populated the same way) to `generic-review-create.html`, and to the generic-review edit UI once #3 is fixed.

---

## 13. 🟢 Review ↔ item detail-page linkage is one-directional — pre-existing, not a regression
**Evidence:** `worker/controllers.js`, casino detail render (`renderCasino`, lines 565–900 inspected in full): the only reference to "Review" is JSON-LD structured-data markup built from the casino's own rating — there is no fetched/linked review row and no "Read our review" card anywhere on the casino page. Sportsbook/affiliate-partner/custom detail pages behave identically.
**Explanation:** I flagged this because it matches what was asked, but want to be precise: this is **not new behavior introduced by the generic content engine** — it's a pattern that already existed for casino and was simply carried over unchanged. Reviews link to their item (`casino_slug` / `reviewed_content_id`), but items never link back to their review, for any content type, old or new. If the product intent is for an item page to surface its own review, that gap applies site-wide, not just to the new types.
**Fix (if desired):** add a `getReviewForItem(contentType, itemId)` lookup call to each detail-page renderer (casino included) and render a "Read the full review" card when one exists.

---

## 14. 🟠 No structured review — no sections, no blocks, no rich text — for generic content
**Evidence:** `worker/database/review_blocks.js` implements a full CRUD module (`getReviewBlocks`, `createReviewBlock`, `updateReviewBlock`, and a delete function) against a `review_blocks` table, keyed by `review_slug` with an ordered `position`. `templates/pages/admin/reviews.html` has a complete UI for it — a block list table, an add/edit form with a rich-text editor (`data-rich-editor` attribute) per block, and reorder/cancel-edit controls (lines ~159–194). A repo-wide search for `review_blocks` / `reviewBlocks` inside `worker/api.js` restricted to generic-review handling returns nothing, and `generic-review-create.html` has only a single flat `<textarea name="content">` with no rich editor attribute at all.
**Explanation:** casino reviews support a genuinely structured, multi-section review-building experience — separate titled blocks, each with its own rich-text content and explicit ordering, editable independently. Generic reviews are limited to one plain-text/HTML blob in a single textarea. This is a significant content-authoring capability gap, not a cosmetic one: any sportsbook/custom-type review that should have distinct sections (e.g. "Odds," "Mobile App," "Payments," matching the `review_criteria_templates` this same patch seeded) has no structural way to express that beyond manually formatting one long text field.
**Fix:** either extend `review_blocks` to work by `review_slug` regardless of `reviewed_content_type` (it may already work unmodified, since it's keyed by slug, not casino), wire the existing block-editor UI into a generic-review edit page, and reuse `worker/component-engine.js`'s existing block-rendering logic on the generic-review detail template.

---

## 15. 🟡 No pagination in the admin UI for any of the four new list pages
**Evidence:** `worker/database/content-items.js` (line 38) and `worker/database/comparisons.js` (line 31) both already support `LIMIT ? OFFSET ?` in their list queries. But `static/js/dashboard.js`'s `loadContentItemsTable()` and `loadComparisonsTable()` never pass `page=` or `limit=` in their `fetch()` calls — the pagination capability exists in the DB layer and is simply never invoked. `custom-types.js`'s list query (`SELECT * FROM custom_content_types ORDER BY label ASC`) and `generic-reviews.js`'s list query (`SELECT * FROM reviews WHERE reviewed_content_type = ? ORDER BY created_at DESC`) have no `LIMIT` at all, at any layer — every row is always fetched.
**Explanation:** low risk today with a handful of seed rows, but this will not scale: once a tenant has hundreds of sportsbook items or reviews, every admin list page load will fetch the entire table. This is a smaller instance of the same overall pattern seen in #5/#6/#11 — capability partially built, never fully connected end-to-end.
**Fix:** add page-number controls to the four list templates and pass `page`/`limit` through to the endpoints that already support it; add `LIMIT`/`OFFSET` to the two DB functions that don't have it yet.

---

## 16. 🟠 License/license country are collected but never shown on the public sportsbook page
**Evidence:** `content-item-edit.html` collects `license` and `license_country` inside the sportsbook-specific fieldset. `worker/controllers.js`, `renderSportsbook()` (lines 4174–4325, inspected in full): `live_betting`/`pre_match`/`cashout`/`mobile_app` are correctly rendered as a feature-badge list (lines ~4197–4201), but `license` and `license_country` never appear anywhere in the same render function.
**Explanation:** for a gambling-adjacent review site, license information is a primary trust signal — casino pages presumably surface it prominently (`casinos.license` is a core, always-visible field). The sportsbook data model captures the identical information, an admin can type it into the edit form, and it is then silently discarded on the public-facing page. This is data captured for no visible purpose today.
**Fix:** add a license/license-country display block to the sportsbook template, matching however casino's license field is rendered.

---

## Summary table

| # | Bug | Severity | Where the break is |
|---|---|---|---|
| 1 | No delete — custom content types | 🟠 High | API + UI |
| 2 | No delete — comparisons | 🟠 High | API + UI |
| 3 | No delete/edit UI — generic reviews | 🔴 Critical | API (delete) + UI (both) |
| 4 | No "View" link — content items list | 🟡 Medium | UI |
| 5 | No logo field | 🟠 High | UI only (schema+read done) |
| 6 | No featured image field | 🟠 High | UI only (schema+read done) |
| 7 | No tracking/affiliate link — sportsbook | 🔴 Critical | Schema + API + UI |
| 8 | Raw ID inputs instead of pickers | 🟡 Medium | UI |
| 9 | Category assignment unbuilt | 🔴 Critical | Full stack |
| 10 | Country/geo targeting unbuilt | 🔴 Critical | Full stack |
| 11 | Sports/payment/currency write path missing | 🟠 High | API + UI (read exists) |
| 12 | No author field — generic reviews | 🟡 Medium | UI |
| 13 | No item→review linkage (pre-existing) | 🟢 Low | Design gap, both old & new |
| 14 | No structured review blocks | 🟠 High | API + UI |
| 15 | No admin-list pagination | 🟡 Medium | UI (+partial API) |
| 16 | License fields never displayed | 🟠 High | UI (render) |

**Overall read:** the generic content engine's foundation (schema, RBAC, item-level scoping, XSS-hardened rendering, basic CRUD for content items) is solid and well-tested. But categorization, geo-targeting, monetization (tracking links), structured reviews, media, and delete-everywhere are either unbuilt, half-wired, or explicitly deferred by the original implementer. Treat this as roughly a "Phase 3 of N" state, not a finished feature.



brainstorming from other members.

priority is the above clean ones. these below are not detailed. use it if only consists of uncovered ones above.


I went through the actual source — schema, admin templates, `dashboard.js` rendering logic, and `controllers.js` route/render code — rather than guessing. Here's what's really there, with the exact evidence.

## 1. Missing Delete — three of four new resource types have none, anywhere
Checked both the UI *and* the backend API for a delete route:

| Resource | Delete API | Delete button |
|---|---|---|
| Content items | ✅ `deleteContentItem()` | ✅ present |
| **Custom content types** | ❌ none found | ❌ none |
| **Comparisons** | ❌ none found | ❌ none |
| **Generic reviews** | ❌ none found | ❌ none |

Once you create a custom type, a comparison, or a generic review, **there is no way to remove it** short of a direct D1 SQL `DELETE` — not from the UI, not from the API. Compare to casino, which has a full `/api/v1/review/delete` route with FK-safety handling.

## 2. Generic reviews list — the "Actions" column is literally empty
`static/js/dashboard.js` ~line 990:
```js
<td class="table-actions"></td>
```
No Edit, no Delete, no View — despite the backend having a working `/api/v1/generic-review/update` endpoint. You can create a generic review through the form, but you can never open it again through the UI to fix a typo.

## 3. Content-items list is missing "View"
Casino rows, custom-type rows, and comparison rows all render **View + Edit(+ Delete)**. The content-items row (line ~314) only renders **Delete + Edit** — no link out to see the live page. Minor, but inconsistent with every sibling list.

## 4. No logo field — anywhere in the form, despite the schema supporting it
`content_items` has `logo_media_id` and `featured_image_media_id` columns, and the **read** queries already `LEFT JOIN media_library` to resolve them. But `content-item-edit.html` and `content-item-create.html` have **zero fields** to set either one. It's a fully wired read path with no write path — these columns can never be populated except by hand in D1. Casino, by contrast, has a plain `Logo URL` text input.

## 5. No tracking/affiliate link for sportsbook items at all
Casino has a **required** `affiliate_url` field — that's the actual monetization link. Sportsbook content items have **no equivalent field whatsoever**. The only related field is on `affiliate_partner`-type items: `linked_affiliate_partner_id`, and it's a bare `<input type="number">` — you have to already know the internal integer primary key of a row in the `affiliate_partners` table. No dropdown, no search, no name shown.

## 6. "Item ID" pickers are raw number inputs, everywhere they appear
In `comparison-edit.html`:
```html
<input type="number" class="item-id" placeholder="Item ID">
...
<input type="number" name="editorial_selection_item_id">
```
Both the comparison's item list and its "Editorial Pick" require typing a raw DB ID by hand — no autocomplete, no name-based search. Compare to the casino edit form's category/country/payment-method pickers, which are populated checkboxes with real names and Select All/Clear All.

## 7. No geo-targeting, categories, or payment methods for any content item
Casino has: country allow/block targeting, category checkboxes, payment-method checkboxes, comma-separated features. **None of these exist for sportsbook, affiliate_partner, or custom items.** They can't be geo-restricted, categorized, or filtered by payment method the way casinos can.

## 8. Confirmed live bug: duplicate/broken review URLs
This one's real and currently shipped:
- `renderReviewList()` (`controllers.js`, the "Reviews" hub page) runs `SELECT * FROM reviews WHERE published = 1` — **unfiltered by `reviewed_content_type`**, so it pulls in generic reviews (sportsbook/affiliate_partner/custom) right alongside casino reviews.
- Every card it renders links unconditionally to `/en/review/${r.slug}` — the **casino-only** route.
- `getReview(db, slug)` (in `reviews.js`) looks up by slug alone, with no filter on `casino_slug` or `reviewed_content_type` — so `/en/review/{generic-review-slug}` **actually resolves**, serving a degraded page (no casino card, blank casino name, broken related-casinos block) for the same review that *also* correctly renders at its real address, `/en/sportsbook/review/{slug}`.

Net effect: every generic review is reachable at **two different URLs** — its correct one, and a broken casino-shaped one — which is bad for users (dead-feeling page) and bad for SEO (duplicate content, no canonical pointing between them). This wasn't part of what I verified with tests earlier because there's no test file covering `renderReviewList()` against the newer content types.

---



More real findings, verified the same way — reading the actual schema, the actual query code, and confirming presence/absence directly.

## 9. Author — confirmed missing, and inconsistent with casino reviews
`templates/pages/admin/reviews.html` (casino reviews) has a real dropdown:
```html
<select name="author_id" id="reviewAuthorSelect">
  <option value="">No author assigned</option>
```
`generic-review-create.html` has **no author field at all** — even though it writes to the same `reviews` table, which shares the same `author_id` column. A generic review can never be attributed to a byline through the UI.

## 10. Category and country targeting — not "missing a field," they're 100% unimplemented, on both ends
This is worse than I initially reported. Migration `0051` actually creates proper normalized join tables for exactly this: `content_categories` and `content_geo`. But I checked every file that touches the database layer, and:

```
grep for content_categories / content_geo across worker/*.js and worker/database/*.js
→ zero results outside the migration file itself
```
No read function, no write function, no API route — nothing. These tables exist in the schema and do nothing. It's not a missing form field; it's a fully unbuilt feature end to end.

## 11. Sports / payment methods / currencies — half-built, and the code says so itself
Same migration also creates `content_sports`, `content_payment_methods`, `content_currencies`. Unlike categories/geo, these **do** have read functions (`getContentItemSports`, `getContentItemPaymentMethods`, `getContentItemCurrencies` in `content-items.js`) — but there is **no `INSERT` anywhere in the codebase** for any of the three. They can be displayed if populated, but nothing can ever populate them through the app. The code comment right above the create function admits it outright:

> "Minimal write path -- enough for a future admin form or a seed script to use; the dashboard UI itself (Phase 25/67 of the original spec) is not part of Phase 3."

This isn't me inferring a gap — the original author flagged it as deferred and it was never picked up in the phases that followed.

## 12. Review → item detail-page linkage: a nuance, not a new bug
I checked this carefully because I didn't want to overstate it. On the casino detail page itself, there's **also** no "Read our review" card or link — only JSON-LD structured-data `Review` markup using the casino's own rating, not an actual linked review row. So this isn't something the generic content engine broke; it's a pre-existing one-directional pattern (review → item via `casino_slug`/`reviewed_content_id`, never item → review) that was carried over consistently. If you expected an item's detail page to surface "here's our review of this," that expectation is unmet for **both** casino and the new types — it's not a regression, just a gap that predates this patch.

## 13. No related-items engine for any generic content type
Casino has a genuinely built related-items system — `getRelatedCasinos()` in `related-casinos.js`, which scores candidates by matching **category** and by matching **features** (parsed from the JSON features array), then blends both pools. I searched for any equivalent touching sportsbook/affiliate_partner/custom — nothing. No related-by-category, no related-by-feature, no "you might also like" of any kind for the new content types. Since category and features aren't even wired up for content items (points 10–11 above), this one couldn't have been built yet anyway — it's the same underlying hole, showing up a second time downstream.




