// The words, links and pictures a studio design shows come from the SITE, never from the studio.
// This maps what the site already stores (Header & Hero settings, site name, navigation items) onto the fields the designs use.
// Anything the site leaves empty stays empty: the live site never shows invented wording. Only the admin preview may fall back
// to the theme's sample text (previewCopy) so a brand-new, empty site still shows a layout.
import { themeCopy } from "./themes.js";

const text = (v) => (typeof v === "string" ? v.trim() : "");
const link = (v) => { const s = text(v); return /^(https?:\/\/|\/|#)[^\s"'<>]*$/.test(s) ? s : ""; };

// site = { siteName, headerHero } (headerHero = parseHeaderHero output); nav = [{label,url}] top-level header navigation.
export function siteCopy(site = {}, nav = []) {
  const hh = site.headerHero || {};
  const heroOn = hh.heroEnabled !== false;
  const slide = Array.isArray(hh.heroSlides) ? hh.heroSlides.find((s) => s && s.src) : null;
  const cards = hh.heroCardsEnabled && Array.isArray(hh.heroCards) ? hh.heroCards.map((c) => text(c.caption) || text(c.alt)).filter(Boolean) : [];
  const b1 = hh.heroButtonEnabled !== false && text(hh.heroButtonText) ? { text: text(hh.heroButtonText), url: link(hh.heroButtonUrl) || "#" } : null;
  const b2 = text(hh.heroButton2Text) ? { text: text(hh.heroButton2Text), url: link(hh.heroButton2Url) || "#" } : null;
  return {
    name: text(site.siteName),
    nav: (Array.isArray(nav) ? nav : []).map((n) => text(n.label)).filter(Boolean).slice(0, 8),
    tagline: hh.announceEnabled ? text(hh.announceText) : "",
    badge: heroOn && hh.heroBadgeEnabled !== false ? text(hh.heroBadge) : "",
    title: heroOn ? text(hh.heroTitle) : "",
    sub: heroOn ? text(hh.heroSubtitle) || text(hh.heroDescription) : "",
    cta: b1 ? b1.text : "", ctaUrl: b1 ? b1.url : "#",
    cta2: b2 ? b2.text : "", cta2Url: b2 ? b2.url : "#",
    cards,
    image: heroOn ? (text(hh.heroImage) || (slide ? text(slide.src) : "")) : "",
    search: hh.showSearch !== false ? text(hh.searchPlaceholder) : "",
  };
}

// Live site: only what the site has. Every decorative sample (stats, people, offers, dates...) is blank, and `live` tells the
// renderers to leave out the pieces that exist only to show off a design.
export function liveCopy(site, nav) {
  const c = siteCopy(site, nav);
  return { ...c, stats: [], people: [], offer: "", offerLabel: "", code: "", promo: "", date: "", eyebrow: "", live: true };
}

// Admin preview: the site's own content first; the theme's sample text only where the site has none.
export function previewCopy(theme, site, nav) {
  const sample = themeCopy(theme);
  const real = siteCopy(site, nav);
  const out = { ...sample, live: false };
  for (const [k, v] of Object.entries(real)) if (Array.isArray(v) ? v.length : v && v !== "#") out[k] = v;
  if (!real.cta) out.ctaUrl = "#";
  if (!real.cta2) out.cta2 = real.cta ? "" : sample.cta2;
  return out;
}
