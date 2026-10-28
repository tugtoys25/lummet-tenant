// Static, zero-specificity (:where) rules that keep text readable on every palette. Appended to the theme <style>.
export const READABILITY_CSS = `
/* ==========================================================
   READABILITY GUARANTEES
   The page can be light or dark; cards, forms and panels are white. Text colour tokens are re-pointed to dark values
   INSIDE white surfaces, so a dark page (white page text) can never put white text on a white card. :where() keeps this
   at zero specificity, so a specific rule that really wants another colour still wins.
   ========================================================== */

:where(
  .card, .feature-card, .news-card, .review-card, .casino-card, .auth-card, .faq-item, .faq-question,
  .info-block, .info-card, .page-content, .pros-cons-block, .review-summary, .search-results, .sidebar-block,
  .research-card, .component-card, .content-card, .cg-card, .review-block-card, .about-standards,
  .component-author, .surface, .surface-flat, [role="dialog"]
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
:where(.card, .feature-card, .news-card, .review-card, .casino-card, .auth-card, .info-card, .page-content, .sidebar-block, .research-card) a:where(:not(.btn)) {
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
