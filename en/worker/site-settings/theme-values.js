// Value sanitisers for theme settings: anything that is not a plain colour, size or listed style falls back.

export function safeColor(value, fallback) {
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

export function safeCssValue(value, fallback) {
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

export function safeThemeStyle(value, allowed, fallback) {
  const v = String(value || "").trim();

  return allowed.includes(v)
    ? v
    : fallback;
}

// ------------------------------------------------------------
// Colour maths. The stylesheets assume a page background, a card surface and a dark header/footer; a saved palette can be
// light or dark, so the tokens below are DERIVED from it and nudged until text is readable (WCAG AA, 4.5:1). A colour that
// cannot be parsed (a named colour, say) is left exactly as given.
// ------------------------------------------------------------
