// What the studio designs show comes from the SITE: its name, logo, navigation and Header & Hero settings.
// live = true  -> the public site: only what the site has, nothing invented (empty stays empty).
// live = false -> the admin preview: the same content, with sample wording only where the site has none.
const t = (v) => (typeof v === "string" ? v.trim() : "");
const url = (v) => { const s = t(v); return /^(https?:\/\/|\/|#)[^\s"'<>]*$/.test(s) ? s : ""; };

// The live page fills {{placeholders}} (e.g. {{casino_count}}) when it renders; the admin preview has no such data, so it drops
// them instead of showing raw braces ("{{casino_count}}+ casinos" becomes "casinos").
export function dropPlaceholders(v) {
  return typeof v === "string" ? v.replace(/\{\{\s*[\w.]+\s*\}\}\+?\s*/g, "").replace(/\s{2,}/g, " ").trim() : v;
}

export function studioCtx(site = {}, { nav = [], navHtml = "", live = false } = {}) {
  const hh = site.headerHero || {};
  const heroOn = hh.heroEnabled !== false;
  const slide = Array.isArray(hh.heroSlides) ? hh.heroSlides.find((s) => s && s.src) : null;
  const b1 = hh.heroButtonEnabled !== false && t(hh.heroButtonText);
  const b2 = t(hh.heroButton2Text);
  const ctx = {
    live,
    siteName: t(site.siteName), logoUrl: url(site.logoUrl), logoMode: hh.logoMode || "both",
    navHtml: typeof navHtml === "string" ? navHtml : "",
    nav: (Array.isArray(nav) ? nav : []).map((n) => ({ label: t(n.label), url: url(n.url) || "/" })).filter((n) => n.label).slice(0, 8),
    announce: hh.announceEnabled ? t(hh.announceText) : "",
    headerCtaText: hh.ctaEnabled ? t(hh.ctaText) : "", headerCtaUrl: url(hh.ctaUrl) || "#",
    showSearch: hh.showSearch !== false, searchPlaceholder: t(hh.searchPlaceholder),
    showAuth: hh.showAuth !== false, loginLabel: t(hh.loginLabel) || "Login", logoutLabel: t(hh.logoutLabel) || "Logout", dashboardLabel: t(hh.dashboardLabel) || "Dashboard",
    badge: heroOn && hh.heroBadgeEnabled !== false ? t(hh.heroBadge) : "",
    title: heroOn ? t(hh.heroTitle) : "", subtitle: heroOn ? t(hh.heroSubtitle) || t(hh.heroDescription) : "",
    ctaText: b1 ? t(hh.heroButtonText) : "", ctaUrl: url(hh.heroButtonUrl) || "#",
    cta2Text: b2, cta2Url: url(hh.heroButton2Url) || "#",
    cards: hh.heroCardsEnabled && Array.isArray(hh.heroCards) ? hh.heroCards.map((c) => t(c.caption) || t(c.alt)).filter(Boolean) : [],
    highlights: t(hh.heroHighlights) ? t(hh.heroHighlights).split("\n").map(t).filter(Boolean).slice(0, 6) : [],
    imageUrl: heroOn ? t(hh.heroImage) || (slide ? t(slide.src) : "") : "",
  };
  if (!live) for (const k of ["announce", "badge", "title", "subtitle", "ctaText", "cta2Text", "headerCtaText"]) ctx[k] = dropPlaceholders(ctx[k]);
  return ctx;
}
