// Static, zero-specificity (:where) rules that keep text readable on every palette. Appended to the theme <style>.
const WHITE_SURFACES = `  .card, .feature-card, .news-card, .review-card, .casino-card, .auth-card, .faq-item, .faq-question,
  .info-block, .info-card, .page-content, .pros-cons-block, .review-summary, .search-results, .sidebar-block,
  .research-card, .component-card, .content-card, .cg-card, .review-block-card, .about-standards,
  .component-author, .surface, .surface-flat, [role="dialog"],
  .casino-hero, .update-card, .author-hero, .authors-grid > .muted, .rv-sec, .rs-card, .sn-nav,
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
  --bg: var(--theme-card-bg-alt, #f5f7fc);
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

// Only added when the PAGE background is dark. The stylesheets hard-code dark slate text for article/review content and for
// meta/date lines (correct on a white surface, invisible directly on a dark page). On the page itself these follow the theme
// text colours; anything inside a white surface keeps its dark text. Specificity is just above the hard-coded rules, so the
// result does not depend on stylesheet order.
const ON_PAGE = `:not(:where(${WHITE_SURFACES}, .table-scroll, .dt__table) *)`;
const CONTENT = ".review-content, .news-content, .article-content, .rich-content";
const META = ".review-meta, .review-dates, .meta, .metadata, .post-meta, .article-meta, .card-meta, .article-author, .review-author, .author, .author-name, .post-author, .date, .dates, .post-date, .publish-date, .published-date, .created-date, .updated-date, .article-date, .news-date, .review-date";

export const DARK_PAGE_CSS = `
/* ==========================================================
   DARK PAGE: text that sits directly on the page background
   ========================================================== */
body :is(${CONTENT})${ON_PAGE},
body :is(${CONTENT})${ON_PAGE} :is(p, li, dd, dt, figcaption, em, span, td, th)${ON_PAGE} {
  color: var(--theme-text);
}
body :is(${CONTENT})${ON_PAGE} :is(h2, h3, h4, h5, h6, strong, b)${ON_PAGE} {
  color: var(--theme-text);
}
body :is(${CONTENT})${ON_PAGE} a:not(.btn)${ON_PAGE} {
  color: var(--theme-link);
}
body :is(${META})${ON_PAGE} {
  color: var(--theme-text-muted);
}
body :is(.review-meta, .meta, .metadata, .post-meta, .article-meta) strong${ON_PAGE} {
  color: var(--theme-text);
}
`;
