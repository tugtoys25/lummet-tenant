// Static, zero-specificity (:where) rules that keep text readable on every palette. Appended to the theme <style>.
const WHITE_SURFACES = `  .card, .feature-card, .news-card, .review-card, .casino-card, .auth-card, .faq-item, .faq-question,
  .info-block, .info-card, .page-content, .pros-cons-block, .review-summary, .search-results, .sidebar-block,
  .research-card, .component-card, .content-card, .cg-card, .review-block-card, .about-standards,
  .component-author, .surface, .surface-flat, [role="dialog"],
  .news-content, .casino-hero, .update-card, .author-hero, .authors-grid > .muted, .rv-sec, .rs-card, .sn-nav,
  .research-reference-card, .news-related-grid > article, .news-list-page .news-grid > article,
  .casino-list-toolbar, .research-filter-bar`;

export const READABILITY_CSS = `
/* ==========================================================
   READABILITY GUARANTEES
   The page can be light or dark; cards, forms and panels are white. Text colour tokens are re-pointed to dark values
   INSIDE white surfaces, so a dark page (white page text) can never put white text on a white card. :where() keeps this
   at zero specificity, so a specific rule that really wants another colour still wins.
   ========================================================== */

:where(
${WHITE_SURFACES}
) {
  --dark: var(--theme-card-text);
  --gray: var(--theme-card-muted);
  --support-text: var(--theme-card-text);
  --support-muted: var(--theme-card-muted);
  --text-strong: var(--theme-card-text);
  --text-body: var(--theme-card-text);
  --text-secondary: var(--theme-card-muted);
  color: var(--theme-card-text);
}

/* Form fields are white boxes: dark text and a visible placeholder, on any page colour. */
:where(input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="color"]), textarea, select) {
  --dark: var(--theme-card-text);
  --gray: var(--theme-card-muted);
  --support-text: var(--theme-card-text);
  --support-muted: var(--theme-card-muted);
  --support-surface: #ffffff;
  color: var(--theme-card-text);
  background-color: #ffffff;
}

::placeholder {
  color: #64748b;
  opacity: 1;
}

/* Links inside white cards must read on white. */
:where(.card, .feature-card, .news-card, .review-card, .casino-card, .auth-card, .info-card, .page-content, .sidebar-block, .research-card, .casino-hero, .update-card, .author-hero, .rv-sec, .rs-card, .sn-nav, .cg-card) a:where(:not(.btn)) {
  color: var(--theme-link-on-light, var(--theme-link));
}

:where(.card, .feature-card, .news-card, .review-card, .casino-card, .auth-card, .info-card, .page-content, .sidebar-block, .research-card) .btn--outline {
  color: var(--theme-link-on-light);
}

/* Header and footer are always dark chrome: light text, light links. */
.site-header,
footer,
.site-footer {
  color: var(--theme-chrome-text);
}

.site-header a:where(:not(.btn)),
footer a:where(:not(.btn)),
.site-footer a:where(:not(.btn)) {
  color: var(--theme-link-on-dark);
}

/* ==========================================================
   FOOTER
   ========================================================== */

footer,
.site-footer {
  background: var(
    --theme-footer-background,
    var(--theme-surface)
  );
}
`;

// Colours that adapt to wherever they land, with no assumption about whether the page or a card is light, dark, tinted or a
// gradient (a theme, a design pack or Card Studio can make either one dark, and the saved page colour does not always say so).
// Everything here is derived from the surrounding text colour (currentColor / inherit), so contrast follows the surface
// automatically. Specificity sits just above the hard-coded rules, so stylesheet order does not matter.
const ON_PAGE = `:not(:where(${WHITE_SURFACES}, .table-scroll, .dt__table) *)`;
const CONTENT = ".review-content, .article-content, .rich-content";
const META = ".review-meta, .review-dates, .meta, .metadata, .post-meta, .article-meta, .card-meta, .article-author, .review-author, .author, .author-name, .post-author, .date, .dates, .post-date, .publish-date, .published-date, .created-date, .updated-date, .article-date, .news-date, .review-date";
const CARDS = ".casino-card, .cg-card, .review-card, .rv-card, .update-card, .research-card, .feature-card, .content-card, .component-card, .news-card";

export const TONE_CSS = `
/* ==========================================================
   TONE-ADAPTIVE TEXT AND PANELS
   ========================================================== */

/* The article body is always a flat white reading surface (its text colours are hard-coded dark), so no theme, design pack or
   page colour can ever put it on a clashing background. */
body .news-content {
  background: #ffffff;
  color: #263244;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: clamp(18px, 3.2vw, 34px);
  box-shadow: 0 1px 2px rgba(15, 23, 42, .05);
  overflow-wrap: anywhere;
}

/* Text that sits directly on the page follows the page text colour, whatever it is. */
body :is(${CONTENT})${ON_PAGE},
body :is(${CONTENT})${ON_PAGE} :is(p, li, dd, dt, figcaption, em, span, h2, h3, h4, h5, h6, strong, b)${ON_PAGE} {
  color: inherit;
}
body :is(${CONTENT})${ON_PAGE} a:not(.btn)${ON_PAGE} {
  color: inherit;
  text-decoration: underline;
}
body :is(${META})${ON_PAGE} {
  color: color-mix(in srgb, currentColor 82%, transparent);
}
body :is(.review-meta, .meta, .metadata, .post-meta, .article-meta) strong${ON_PAGE} {
  color: inherit;
}

/* Offer panels inside any card: the fill and the label are mixed from the card's own text colour, so a dark card gets a
   subtle light panel and a white card gets a subtle dark one. */
body :is(${CARDS}) :is(.casino-card__bonus, .bonus-row) {
  background: color-mix(in srgb, currentColor 9%, transparent);
  color: inherit;
}
body :is(${CARDS}) :is(.bonus-title, .bonus-label, .bonus-row__title) {
  color: color-mix(in srgb, currentColor 74%, transparent);
}

/* Availability: green / red mixed with the surrounding text colour (lighter on dark surfaces, deeper on light ones). */
body .geo-allowed, body .casino-card__geo-status.geo-allowed { color: color-mix(in srgb, #16a34a 62%, currentColor); }
body .geo-blocked, body .casino-card__geo-status.geo-blocked { color: color-mix(in srgb, #dc2626 62%, currentColor); }
body .geo-unknown, body .casino-card__geo-status.geo-unknown { color: color-mix(in srgb, currentColor 72%, transparent); }

/* Status badges inside cards ("Available", "Published"): a tinted pill whose text follows the card. */
body :is(${CARDS}) .status-badge {
  background: color-mix(in srgb, currentColor 10%, transparent);
  color: inherit;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
}
body :is(${CARDS}) .status-badge.status-published {
  background: color-mix(in srgb, #22c55e 18%, transparent);
  border-color: color-mix(in srgb, #22c55e 45%, transparent);
  color: color-mix(in srgb, #16a34a 62%, currentColor);
}
`;
