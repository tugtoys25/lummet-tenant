
---

## 14. Post-integration hardening: site-wide escaping audit

While integrating onto the content-engine codebase, the same escaping bug found on the news
and author pages (`worker/render.js`'s `{{var}}` substitution applies **zero** escaping unless
the key is in a small `CONTENT_FIELDS` allow-list) was confirmed to be **site-wide**, not
specific to the newsroom. Fixed in this pass, all verified with real payloads through the real
renderers (`test/xss-regression-content-pages.test.js`):

- `renderCasino`, `renderReview` (+ `casino_name`), `renderCountry`
- `renderSportsbook`, `renderAffiliatePartner`, `renderCustom`
- `renderGenericReview`, `renderComparison`, `renderUpdate`, `renderAffiliate`
- `renderCountryCustomPage`, `renderCategoryCountryPage` (+ their `country_name`,
  `parent_label`, `author_name`, `intro` fields — `intro` now goes through `sanitizeHtml`
  since it legitimately carries some author-formatted HTML)
- `buildCasinoCards` / `buildReviewCasinoCards`: a shared card-builder used across the casino
  list, homepage, review pages and seo-landing pages had four raw `${casino.name}`
  interpolations (aria-label, title attribute, image alt, heading text) inside a JS template
  literal — a distinct injection point from the `{{var}}` engine bug, found while testing
  `renderReview`. Fixed with one `escapeHtml()`'d variable reused at all four sites.

**Confirmed but NOT fixed in this pass** — a further ~35–40 raw `${x.title}` / `${x.name}`
interpolations remain in other inline JS template-literal HTML builders across
`controllers.js` (mostly list/card-rendering helpers for content types, sections, and admin
list views). These were identified by static grep
(`\$\{[a-zA-Z_.]*\.(title|name)\}`, deliberately excluding anything already wrapped in an
escaping call) but not individually triaged or fixed — that is real, separate follow-up work,
not a rounding error, and deserves its own careful pass with the same real-payload
verification used here rather than a blind bulk edit.

Everything in this section is on the currently-active code path regardless of any `news_*`
flag — none of it is newsroom-specific.
