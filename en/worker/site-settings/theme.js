// ============================================================
// THEME CSS
// Generates tenant-specific CSS variables.
// ============================================================

function safeColor(value, fallback) {
  const v = String(value || "").trim();

  if (!v) return fallback;

  // #RGB / #RRGGBB / #RRGGBBAA
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) {
    return v;
  }

  // rgb(), rgba(), hsl(), hsla()
  if (
    /^(rgb|rgba|hsl|hsla)\([^)]*\)$/i.test(v)
  ) {
    return v;
  }

  return fallback;
}

function safeCssValue(value, fallback) {
  const v = String(value || "").trim();

  if (!v) return fallback;

  // Only permit simple CSS sizing values.
  if (
    /^(0|auto|\d+(?:\.\d+)?(?:px|rem|em|%|vw|vh))$/i.test(v)
  ) {
    return v;
  }

  return fallback;
}

function safeThemeStyle(value, allowed, fallback) {
  const v = String(value || "").trim();

  return allowed.includes(v)
    ? v
    : fallback;
}

export function buildThemeCss(siteSettings) {

  const s =
    siteSettings || {};


  const primary =
    safeColor(
      s.themePrimary,
      "#8b5cf6"
    );

  const primaryHover =
    safeColor(
      s.themePrimaryHover,
      "#7c3aed"
    );

  const secondary =
    safeColor(
      s.themeSecondary,
      "#ec4899"
    );

  const secondaryHover =
    safeColor(
      s.themeSecondaryHover,
      "#db2777"
    );

  const accent =
    safeColor(
      s.themeAccent,
      "#22d3ee"
    );

  const background =
    safeColor(
      s.themeBackground,
      "#050505"
    );

  const surface =
    safeColor(
      s.themeSurface,
      "#0f0f12"
    );

  const surfaceAlt =
    safeColor(
      s.themeSurfaceAlt,
      "#15151a"
    );

  const text =
    safeColor(
      s.themeText,
      "#ffffff"
    );

  const textMuted =
    safeColor(
      s.themeTextMuted,
      "#a1a1aa"
    );

  const border =
    safeColor(
      s.themeBorder,
      "#27272a"
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

  --theme-text: ${text};
  --theme-text-muted: ${textMuted};

  --theme-border: ${border};

  --theme-button-text: ${buttonText};

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
  color: var(--theme-primary);
}

a:hover {
  color: var(--theme-primary-hover);
}


/* ==========================================================
   PRIMARY BUTTONS
   ========================================================== */

.btn--primary {
  background: var(--theme-primary);
  border-color: var(--theme-primary);
  color: var(--theme-button-text);
}

.btn--primary:hover {
  background: var(--theme-primary-hover);
  border-color: var(--theme-primary-hover);
}


/* ==========================================================
   GHOST BUTTONS
   ========================================================== */

.btn--ghost {
  border-color: var(--theme-border);
  color: var(--theme-text);
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
  background: var(--theme-surface);
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
  background: var(--theme-primary);
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

</style>
`;
}
