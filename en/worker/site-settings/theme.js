// ============================================================
// THEME CSS
// Generates tenant-specific CSS variables.
// ============================================================

import { safeColor, safeCssValue, safeThemeStyle } from "./theme-values.js";
import { toRgb, toHex, luminance, contrast, mixRgb, readableOn, bestTextOn } from "./colour.js";
import { READABILITY_CSS } from "./theme-readability.js";

export { readableOn };


export function buildThemeCss(siteSettings) {

  const s =
    siteSettings || {};


  const primary =
    safeColor(
      s.themePrimary,
      "#2563eb"
    );

  const primaryHover =
    safeColor(
      s.themePrimaryHover,
      "#1d4ed8"
    );

  const secondary =
    safeColor(
      s.themeSecondary,
      "#0ea5e9"
    );

  const secondaryHover =
    safeColor(
      s.themeSecondaryHover,
      "#0284c7"
    );

  const accent =
    safeColor(
      s.themeAccent,
      "#0891b2"
    );

  const background =
    safeColor(
      s.themeBackground,
      "#f5f7fb"
    );

  const surface =
    safeColor(
      s.themeSurface,
      "#0f172a"
    );

  const surfaceAlt =
    safeColor(
      s.themeSurfaceAlt,
      "#1e293b"
    );

  const text =
    safeColor(
      s.themeText,
      "#0f172a"
    );

  const textMuted =
    safeColor(
      s.themeTextMuted,
      "#475569"
    );

  const border =
    safeColor(
      s.themeBorder,
      "#dbe2ec"
    );

  const buttonText =
    safeColor(
      s.themeButtonText,
      "#ffffff"
    );

  const cardRadius =
    safeCssValue(
      s.themeCardRadius,
      "12px"
    );

  const buttonRadius =
    safeCssValue(
      s.themeButtonRadius,
      "8px"
    );

  const containerWidth =
    safeCssValue(
      s.themeContainerWidth,
      "1200px"
    );


  // ----------------------------------------------------------
  // Derived, always-readable tokens (see the colour maths above)
  // ----------------------------------------------------------
  const bgRgb = toRgb(background);
  const surfRgb = toRgb(surface);
  const pageIsDark = bgRgb ? luminance(bgRgb) < 0.179 : false;

  // Cards, forms and panels are white on every theme (that is how the stylesheets draw them), so the text INSIDE them is
  // always dark, whatever the page text colour is. The page text colour is checked against the page background only.
  const cardSurface = "#ffffff";
  const cardText = "#0f172a";
  const cardMuted = "#475569";

  // Header, footer and dark panels: the saved surface when it is dark; otherwise a deep slate so their light text still reads.
  const chrome = surfRgb && luminance(surfRgb) < 0.179 ? surface : "#0f172a";
  const chromeAlt = toRgb(surfaceAlt) && luminance(toRgb(surfaceAlt)) < 0.179 ? surfaceAlt : "#1e293b";
  const chromeText = "#f8fafc";

  // Page text must read on the page background.
  const textSafe = readableOn(text, [background], 4.5);
  const mutedSafe = readableOn(textMuted, [background], 4.5);

  // Links and outline buttons: the brand colour, moved only as far as needed to read on the page and the alternate band
  // (links inside white cards, and in the header/footer, get their own tokens below).
  const sectionAlt = pageIsDark
    ? chrome
    : (bgRgb ? toHex(mixRgb(bgRgb, toRgb(textSafe) || [15, 23, 42], 0.045)) : "#eef2f7");
  const linkSafe = readableOn(primary, [background, sectionAlt], 4.5);
  const linkHoverSafe = readableOn(primaryHover, [background, sectionAlt], 4.5);
  const linkOnChrome = readableOn(primary, [chrome, chromeAlt], 4.5);
  const linkOnLight = readableOn(primary, [cardSurface], 4.5);

  // Text on a brand-coloured button: the saved one if it reads, else white or near-black, whichever reads better.
  const primaryRgb = toRgb(primary);
  const buttonTextSafe = primaryRgb && toRgb(buttonText) && contrast(toRgb(buttonText), primaryRgb) >= 4.5 ? buttonText : bestTextOn(primary);
  // A brand colour too mid-tone for either white or dark text (about 4.0 to 4.5:1) is deepened slightly for button FILLS so
  // the label reads at 4.5:1. Links, borders and everything else keep the exact brand colour.
  const solidFor = (color, textColor) => {
    const c = toRgb(color), t = toRgb(textColor);
    if (!c || !t || contrast(c, t) >= 4.5) return color;
    const toward = luminance(t) > 0.5 ? [0, 0, 0] : [255, 255, 255];
    for (let i = 1; i <= 20; i++) { const m = mixRgb(c, toward, i / 20); if (contrast(m, t) >= 4.5) return toHex(m); }
    return color;
  };
  const primarySolid = solidFor(primary, buttonTextSafe);
  const primaryHoverSolid = solidFor(primaryHover, buttonTextSafe);
  const primaryHoverRgb = toRgb(primaryHover);
  const buttonTextHoverSafe = buttonTextSafe;

  const headerBg = safeColor(s.themeHeaderBackground, "");
  const footerBg = safeColor(s.themeFooterBackground, chrome);


  const headerStyle =
    safeThemeStyle(
      s.themeHeaderStyle,
      [
        "default",
        "transparent",
        "solid",
        "glass"
      ],
      "default"
    );

  const cardStyle =
    safeThemeStyle(
      s.themeCardStyle,
      [
        "default",
        "flat",
        "bordered",
        "glass",
        "elevated"
      ],
      "default"
    );

  const buttonStyle =
    safeThemeStyle(
      s.themeButtonStyle,
      [
        "default",
        "rounded",
        "pill",
        "square"
      ],
      "default"
    );

  const layoutStyle =
    safeThemeStyle(
      s.themeLayoutStyle,
      [
        "default",
        "compact",
        "wide"
      ],
      "default"
    );


  return `
<style id="tenant-theme">

:root {

  --theme-primary: ${primary};
  --theme-primary-hover: ${primaryHover};

  --theme-secondary: ${secondary};
  --theme-secondary-hover: ${secondaryHover};

  --theme-accent: ${accent};

  --theme-background: ${background};
  --theme-surface: ${surface};
  --theme-surface-alt: ${surfaceAlt};

  --theme-text: ${textSafe};
  --theme-text-muted: ${mutedSafe};

  --theme-border: ${border};

  --theme-button-text: ${buttonTextSafe};
  --theme-button-text-hover: ${buttonTextHoverSafe};
  --theme-primary-solid: ${primarySolid};
  --theme-primary-hover-solid: ${primaryHoverSolid};

  --theme-link: ${linkSafe};
  --theme-link-hover: ${linkHoverSafe};
  --theme-link-on-dark: ${linkOnChrome};
  --theme-link-on-light: ${linkOnLight};

  --theme-card-text: ${cardText};
  --theme-card-muted: ${cardMuted};
  --theme-section-alt: ${sectionAlt};

  --theme-chrome: ${chrome};
  --theme-chrome-alt: ${chromeAlt};
  --theme-chrome-text: ${chromeText};

  /* Header, footer and dark panels always get a dark surface, so their light text always reads. */
  --surface-dark: ${chrome};
  --dark-2: ${chromeAlt};
  --theme-footer-background: ${footerBg};
  --theme-header-background: ${headerBg || chrome};

  --theme-card-radius: ${cardRadius};
  --theme-button-radius: ${buttonRadius};

  --theme-container-width: ${containerWidth};
}


/* ==========================================================
   GLOBAL
   ========================================================== */

body {
  background: var(--theme-background);
  color: var(--theme-text);
}

.container {
  max-width: var(--theme-container-width);
}


/* ==========================================================
   LINKS
   ========================================================== */

a {
  color: var(--theme-link);
}

a:hover {
  color: var(--theme-link-hover);
}


/* ==========================================================
   PRIMARY BUTTONS
   ========================================================== */

.btn--primary {
  background: var(--theme-primary-solid);
  border-color: var(--theme-primary-solid);
  color: var(--theme-button-text);
}

.btn--primary:hover {
  background: var(--theme-primary-hover-solid);
  border-color: var(--theme-primary-hover-solid);
  color: var(--theme-button-text-hover);
}

.btn--outline {
  color: var(--theme-link);
  border-color: var(--theme-link);
}

.btn--outline:hover {
  background: var(--theme-primary);
  border-color: var(--theme-primary);
  color: var(--theme-button-text);
}


/* ==========================================================
   GHOST BUTTONS
   ========================================================== */

.btn--ghost {
  border-color: var(--theme-border);
  color: var(--dark);
  background: transparent;
}

.btn--ghost:hover {
  border-color: var(--theme-primary);
  color: var(--theme-primary);
}


/* ==========================================================
   SURFACES
   ========================================================== */

.section--alt {
  background: var(--theme-section-alt);
  color: var(--theme-text);
}

.card,
.feature-card,
.news-card,
.review-card,
.casino-card {
  border-color: var(--theme-border);
}


/* ==========================================================
   CARDS
   ========================================================== */

body.theme-card-flat .feature-card,
body.theme-card-flat .casino-card,
body.theme-card-flat .news-card,
body.theme-card-flat .review-card {
  box-shadow: none;
  border-color: transparent;
}

body.theme-card-bordered .feature-card,
body.theme-card-bordered .casino-card,
body.theme-card-bordered .news-card,
body.theme-card-bordered .review-card {
  border: 1px solid var(--theme-border);
  box-shadow: none;
}

body.theme-card-glass .feature-card,
body.theme-card-glass .casino-card,
body.theme-card-glass .news-card,
body.theme-card-glass .review-card {
  background: rgba(255,255,255,.04);
  backdrop-filter: blur(12px);
  border: 1px solid var(--theme-border);
  /* Glass cards are see-through, so their text follows the page, not the white-card text below. */
  color: var(--theme-text);
  --dark: var(--theme-text);
  --support-text: var(--theme-text);
  --gray: var(--theme-text-muted);
  --support-muted: var(--theme-text-muted);
}

body.theme-card-elevated .feature-card,
body.theme-card-elevated .casino-card,
body.theme-card-elevated .news-card,
body.theme-card-elevated .review-card {
  box-shadow: 0 12px 40px rgba(0,0,0,.25);
}


/* ==========================================================
   RADIUS
   ========================================================== */

.feature-card,
.casino-card,
.news-card,
.review-card {
  border-radius: var(--theme-card-radius);
}


/* ==========================================================
   BUTTON SHAPES
   ========================================================== */

body.theme-button-rounded .btn {
  border-radius: var(--theme-button-radius);
}

body.theme-button-pill .btn {
  border-radius: 999px;
}

body.theme-button-square .btn {
  border-radius: 0;
}


/* ==========================================================
   HEADER
   ========================================================== */

body.theme-header-solid header,
body.theme-header-solid .site-header {
  background: var(--theme-surface);
}

body.theme-header-glass header,
body.theme-header-glass .site-header {
  background: rgba(0,0,0,.55);
  backdrop-filter: blur(16px);
}

body.theme-header-transparent header,
body.theme-header-transparent .site-header {
  background: transparent;
}


/* ==========================================================
   LAYOUT WIDTH
   ========================================================== */

body.theme-layout-compact .container {
  max-width: 1080px;
}

body.theme-layout-wide .container {
  max-width: 1440px;
}


/* ==========================================================
   FORM FOCUS
   ========================================================== */

input:focus,
textarea:focus,
select:focus {
  border-color: var(--theme-primary);
  outline-color: var(--theme-primary);
}


/* ==========================================================
   HERO
   ========================================================== */

.hero-badge {
  color: var(--theme-accent);
}

.hero a.btn--primary {
  background: var(--theme-primary-solid);
}

${READABILITY_CSS}

</style>
`;
}
