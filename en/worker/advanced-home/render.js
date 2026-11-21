// Advanced Homepage: turns a validated config plus loaded data into HTML. Every value from the config or the database is
// escaped here, so a saved setting can never inject markup.
import { escapeHtml, countryToFlag } from "../controllers/shared.js";
import { ADVANCED_HOME_CSS } from "./css.js";
import { fill } from "./schema.js";
import { cardImgTag, featuredImageSrc } from "../media-url.js";

const e = (v) => escapeHtml(String(v ?? ""));
const A = (url) => e(url);

// Icons come from the dashboard: keyword rules (comma-separated words, any match wins) and a default icon.
export const categoryIcon = (c, icons = {}) => {
  const s = `${c.name || ""} ${c.slug || ""}`.toLowerCase();
  for (const r of icons.iconRules || []) if (String(r.match).split(",").some((w) => w.trim() && s.includes(w.trim().toLowerCase()))) return r.icon;
  return icons.defaultIcon || "";
};

function head(title, sub, linkLabel, linkUrl) {
  return `<div class="ah-head"><div>${title ? `<h2>${e(title)}</h2>` : ""}${sub ? `<p class="ah-sub">${e(sub)}</p>` : ""}</div>${linkLabel && linkUrl ? `<a class="ah-link" href="${A(linkUrl)}">${e(linkLabel)} →</a>` : ""}</div>`;
}
const wrap = (type, inner, alt = false, id = type) => `<section class="ah-section${alt ? " ah-section--alt" : ""}" id="ah-${id}" data-ah-section="${type}"><div class="ah-wrap">${inner}</div></section>`;
const prose = (text) => String(text || "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => (b.startsWith("## ") ? `<h3>${e(b.slice(3))}</h3>` : `<p>${e(b).replace(/\n/g, "<br>")}</p>`)).join("");

const R = {
  hero(s, d, v) {
    if (v.siteHero || !s.title) return "";
    return `<section class="ah-hero ah-hero--${s.align}" id="ah-hero" data-ah-section="hero"><div class="ah-wrap">
      ${s.kicker ? `<span class="ah-kicker">${e(fill(s.kicker, v))}</span>` : ""}
      <h1>${e(fill(s.title, v))}</h1>
      ${s.body ? `<p>${e(fill(s.body, v))}</p>` : ""}
      <div class="ah-cta">${s.primaryLabel && s.primaryUrl ? `<a class="btn btn--primary btn--lg" href="${A(s.primaryUrl)}">${e(s.primaryLabel)}</a>` : ""}${s.secondaryLabel && s.secondaryUrl ? `<a class="btn btn--ghost btn--lg" href="${A(s.secondaryUrl)}">${e(s.secondaryLabel)}</a>` : ""}</div>
      ${s.proof ? `<div class="ah-proof">${e(fill(s.proof, v))}</div>` : ""}</div></section>`;
  },
  filters(s, d, v) {
    const groups = [];
    const chips = (label, items) => items.length ? `<div class="ah-chips">${label ? `<span class="ah-chips__label">${e(label)}</span>` : ""}${items.join("")}</div>` : "";
    if (s.showCategories) groups.push(chips(v.labels.categories, d.categories.slice(0, s.categoryLimit).map((c) => `<a class="ah-chip" href="/en/category/${A(c.slug)}">${e(c.name)}</a>`)));
    if (s.showCountries) groups.push(chips(v.labels.countries, d.countries.slice(0, s.countryLimit).map((c) => `<a class="ah-chip" href="/en/country/${A(c.code)}">${countryToFlag(c.code)} ${e(c.name)}</a>`)));
    if (s.showPayments) groups.push(chips(v.labels.payments, d.payments.slice(0, s.paymentLimit).map((p) => `<a class="ah-chip" href="/en/payment-methods/${A(p.slug)}">${e(p.name)}</a>`)));
    const body = groups.filter(Boolean).join("");
    return body ? `<div class="ah-filters" id="ah-filters" data-ah-section="filters"><div class="ah-wrap">${body}</div></div>` : "";
  },
  top_picks(s, d, v) {
    const flag = d.country ? countryToFlag(d.country) : "";
    const geoLine = d.countryName && v.labels.geoNote ? `<div class="ah-geo">${flag} ${e(fill(v.labels.geoNote, v))}</div>` : "";
    const body = d.pickCardsHtml ? `<div class="casino-grid ah-grid" id="ah-casino-grid">${d.pickCardsHtml}</div>` : (v.labels.emptyText ? `<div class="ah-empty">${e(fill(v.labels.emptyText, v))}</div>` : "");
    const disc = s.disclosure ? `<p class="ah-disclosure">${e(fill(s.disclosure, v))}${s.disclosureUrl && s.disclosureLabel ? ` <a href="${A(s.disclosureUrl)}">${e(s.disclosureLabel)}</a>` : ""}</p>` : "";
    const more = s.viewAllLabel && s.viewAllUrl ? `<div class="ah-more"><a class="btn btn--secondary" href="${A(s.viewAllUrl)}">${e(s.viewAllLabel)}</a></div>` : "";
    return wrap("top_picks", head(fill(s.title, v), fill(s.subtitle, v)) + geoLine + body + disc + more);
  },
  browse(s, d, v) {
    const cards = [];
    if (s.showCategories) d.categories.slice(0, s.categoryLimit).forEach((c) => cards.push(`<a class="ah-card" href="/en/category/${A(c.slug)}"><span class="ah-card__icon" aria-hidden="true">${categoryIcon(c, v.icons)}</span><b>${e(c.name)}</b></a>`));
    if (s.showCountries) d.countries.slice(0, s.countryLimit).forEach((c) => cards.push(`<a class="ah-card" href="/en/country/${A(c.code)}"><span class="ah-card__icon" aria-hidden="true">${countryToFlag(c.code)}</span><b>${e(c.name)}</b></a>`));
    return cards.length ? wrap("browse", head(fill(s.title, v)) + `<div class="ah-cards">${cards.join("")}</div>`, true) : "";
  },
  payments(s, d, v) {
    const list = d.payments.slice(0, s.limit);
    if (!list.length) return "";
    return wrap("payments", head(fill(s.title, v), s.subtitle, s.viewAllLabel, s.viewAllUrl) + `<div class="ah-pay">${list.map((p) => `<a href="/en/payment-methods/${A(p.slug)}">${p.icon_url ? `<img src="${A(p.icon_url)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ""}<span>${e(p.name)}</span></a>`).join("")}</div>`);
  },
  how_we_rate(s, d, v) {
    if (!s.criteria.length) return "";
    const items = s.criteria.map((c) => `<li><b><span>${e(c.label)}</span>${s.weightsConfirmed ? `<span>${c.weight}%</span>` : ""}</b>${s.weightsConfirmed ? `<div class="ah-bar"><i style="width:${c.weight}%"></i></div>` : ""}${c.description ? `<p>${e(c.description)}</p>` : ""}</li>`).join("");
    return wrap("how_we_rate", head(fill(s.title, v), s.intro, s.linkLabel, s.linkUrl) + `<ul class="ah-criteria">${items}</ul>`, true);
  },
  reviews_news(s, d, v) {
    // Same markup as the default homepage's review cards and news cards, so their CSS and Card Studio styling apply unchanged.
    const stars = (n) => `${"★".repeat(Math.round(n || 0))}${"☆".repeat(5 - Math.round(n || 0))}`;
    const reviews = s.showReviews && d.reviews.length ? `<div>${s.reviewsTitle ? `<h3>${e(s.reviewsTitle)}</h3>` : ""}<div class="casino-grid">${d.reviews.map((r) => `
    <div class="casino-card">
      <div class="casino-card__header">
        <div class="casino-card__logo-wrap"><img src="${A(r.casino_logo || "/static/images/default.png")}" alt="${e(r.casino_name || "")}" class="casino-card__logo" onerror="this.src='/static/images/default.png'" loading="lazy"></div>
        <div class="casino-card__title-group"><h3 class="casino-card__name"><a href="/en/review/${A(r.slug)}">${e(r.title)}</a></h3><div class="casino-card__rating">${stars(r.rating)}</div></div>
      </div>
      <div class="casino-card__body"><p class="muted">${e(r.casino_name || "")}</p></div>
      ${v.labels.readReview ? `<div class="casino-card__actions"><a href="/en/review/${A(r.slug)}" class="btn btn--secondary">${e(v.labels.readReview)}</a></div>` : ""}
    </div>`).join("")}</div></div>` : "";
    const news = s.showNews && d.news.length ? `<div>${s.newsTitle ? `<h3>${e(s.newsTitle)}</h3>` : ""}<div class="news-grid">${d.news.map((n) => { const img = cardImgTag(featuredImageSrc(n), n.title); return `
    <a href="/en/news/${A(n.slug)}" class="news-card">${img}<h3>${e(n.title)}</h3>${n.excerpt ? `<p class="muted">${e(n.excerpt)}</p>` : ""}<p class="muted">${e(new Date(n.published_at || n.created_at).toLocaleDateString())}</p></a>`; }).join("")}</div></div>` : "";
    return reviews || news ? wrap("reviews_news", `<div class="ah-rn">${reviews}${news}</div>`) : "";
  },
  faq(s, d, v) {
    if (!s.items.length) return "";
    const ld = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: s.items.map((i) => ({ "@type": "Question", name: fill(i.q, v), acceptedAnswer: { "@type": "Answer", text: fill(i.a, v) } })) }).replace(/</g, "\\u003c");
    return wrap("faq", head(fill(s.title, v)) + `<div class="ah-faq">${s.items.map((i) => `<details><summary>${e(fill(i.q, v))}</summary><p>${e(fill(i.a, v))}</p></details>`).join("")}</div><script type="application/ld+json">${ld}</script>`, true);
  },
  trust(s, d, v) {
    const chips = `${s.pageUrl && s.pageLabel ? `<a class="ah-chip" href="${A(s.pageUrl)}">${e(s.pageLabel)}</a>` : ""}${s.links.map((l) => `<a class="ah-chip" href="${A(l.url)}" target="_blank" rel="noopener nofollow">${e(l.label)}</a>`).join("")}`;
    if (!s.title && !s.text && !s.ageBadge && !chips) return "";
    return `<section class="ah-trust" id="ah-trust" data-ah-section="trust"><div class="ah-wrap"><div class="ah-trust__row">${s.ageBadge ? `<span class="ah-age" aria-label="${e(s.ageBadge)}">${e(s.ageBadge)}</span>` : ""}<div class="ah-trust__text">${s.title ? `<h2>${e(fill(s.title, v))}</h2>` : ""}${s.text ? `<p>${e(fill(s.text, v))}</p>` : ""}</div>
      ${chips ? `<div class="ah-chips">${chips}</div>` : ""}</div></div></section>`;
  },
  seo_prose(s) {
    const html = prose(s.text);
    if (!html) return "";
    return wrap("seo_prose", (s.title ? `<h2>${e(s.title)}</h2>` : "") + `<details class="ah-prose"><summary>${e(s.summaryLabel || s.title || "…")}</summary><div class="ah-prose__body">${html}</div></details>`);
  },
  newsletter(s, d, v) {
    return `<section class="ah-news" id="ah-newsletter" data-ah-section="newsletter"><div class="ah-wrap">${s.title ? `<h2>${e(fill(s.title, v))}</h2>` : ""}${s.text ? `<p>${e(fill(s.text, v))}</p>` : ""}
      <form class="newsletter-form" novalidate><input type="email" name="email" placeholder="${e(s.placeholder)}" required aria-label="${e(v.labels.emailLabel || s.placeholder || "Email")}"><button type="submit" class="btn btn--primary">${e(s.button || "OK")}</button></form><p class="newsletter-message" style="display:none"></p></div></section>`;
  },
  text_block(s, d, v) {
    const body = prose(fill(s.body, v));
    if (!s.title && !body && !(s.buttonLabel && s.buttonUrl)) return "";
    const btn = s.buttonLabel && s.buttonUrl ? `<div class="ah-more"><a class="btn btn--primary" href="${A(s.buttonUrl)}">${e(s.buttonLabel)}</a></div>` : "";
    return wrap("text_block", `<div class="ah-text ah-text--${s.align}">${s.title ? `<h2>${e(fill(s.title, v))}</h2>` : ""}${body ? `<div class="ah-text__body">${body}</div>` : ""}${btn}</div>`, s.tone === "alt", s.id);
  },
  link_cards(s, d, v) {
    if (!s.items.length) return "";
    const cards = s.items.map((c) => { const inner = `${c.icon ? `<span class="ah-card__icon" aria-hidden="true">${e(c.icon)}</span>` : ""}<b>${e(fill(c.title, v))}</b>${c.text ? `<small>${e(fill(c.text, v))}</small>` : ""}`; return c.url ? `<a class="ah-card" href="${A(c.url)}">${inner}</a>` : `<div class="ah-card">${inner}</div>`; }).join("");
    return wrap("link_cards", head(fill(s.title, v), fill(s.subtitle, v)) + `<div class="ah-cards ah-cards--c${s.columns}">${cards}</div>`, s.tone === "alt", s.id);
  },
};

// Returns { main, newsletter }: the newsletter goes in its own slot so it can sit directly above the footer.
export function renderAdvancedHome(config, data, ctx = {}) {
  const op = config.options || {};
  const labels = op.labels || {};
  const v = { casino_count: data.casinoCount || "", country: data.countryName || labels.fallbackCountry || "", site_name: ctx.siteName || "", siteHero: Boolean(ctx.siteHero), labels, icons: { defaultIcon: op.defaultIcon, iconRules: op.iconRules } };
  let main = `<style>${ADVANCED_HOME_CSS}</style>`;
  let newsletter = "";
  for (const s of config.sections) {
    if (!s.enabled) continue;
    const html = R[s.type] ? R[s.type](s, data, v) : "";
    if (s.type === "newsletter") newsletter = html; else main += html;
  }
  return { main, newsletter };
}
