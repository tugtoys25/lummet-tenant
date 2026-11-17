// Advanced Homepage: turns a validated config plus loaded data into HTML. Every value from the config or the database is
// escaped here, so a saved setting can never inject markup.
import { escapeHtml, countryToFlag } from "../controllers/shared.js";
import { ADVANCED_HOME_CSS } from "./css.js";
import { fill } from "./schema.js";

const e = (v) => escapeHtml(String(v ?? ""));
const A = (url) => e(url);

const ICONS = [[/crypto|bitcoin/i, "₿"], [/live|dealer/i, "🎥"], [/slot/i, "🎰"], [/bonus|free|spin/i, "🎁"], [/sport|bet/i, "⚽"], [/new/i, "✨"], [/mobile|app/i, "📱"], [/fast|instant|payout|withdraw/i, "⚡"], [/high|vip|roller/i, "💎"], [/deposit|low|min/i, "💵"], [/jackpot/i, "🏆"], [/poker/i, "♠️"], [/table|roulette|blackjack/i, "🃏"]];
export const categoryIcon = (c) => { const s = `${c.name || ""} ${c.slug || ""}`; for (const [re, ic] of ICONS) if (re.test(s)) return ic; return "🎲"; };

function head(title, sub, linkLabel, linkUrl) {
  return `<div class="ah-head"><div>${title ? `<h2>${e(title)}</h2>` : ""}${sub ? `<p class="ah-sub">${e(sub)}</p>` : ""}</div>${linkLabel && linkUrl ? `<a class="ah-link" href="${A(linkUrl)}">${e(linkLabel)} →</a>` : ""}</div>`;
}
const wrap = (type, inner, alt = false) => `<section class="ah-section${alt ? " ah-section--alt" : ""}" id="ah-${type}" data-ah-section="${type}"><div class="ah-wrap">${inner}</div></section>`;

const R = {
  hero(s, d, v) {
    if (v.siteHero) return "";
    return `<section class="ah-hero ah-hero--${s.align}" id="ah-hero" data-ah-section="hero"><div class="ah-wrap">
      ${s.kicker ? `<span class="ah-kicker">${e(fill(s.kicker, v))}</span>` : ""}
      <h1>${e(fill(s.title, v))}</h1>
      ${s.body ? `<p>${e(fill(s.body, v))}</p>` : ""}
      <div class="ah-cta">${s.primaryLabel && s.primaryUrl ? `<a class="btn btn--primary btn--lg" href="${A(s.primaryUrl)}">${e(s.primaryLabel)}</a>` : ""}${s.secondaryLabel && s.secondaryUrl ? `<a class="btn btn--ghost btn--lg" href="${A(s.secondaryUrl)}">${e(s.secondaryLabel)}</a>` : ""}</div>
      ${s.proof ? `<div class="ah-proof">${e(fill(s.proof, v))}</div>` : ""}</div></section>`;
  },
  filters(s, d) {
    const groups = [];
    const chips = (label, items) => items.length ? `<div class="ah-chips"><span class="ah-chips__label">${label}</span>${items.join("")}</div>` : "";
    if (s.showCategories) groups.push(chips("Categories", d.categories.slice(0, s.categoryLimit).map((c) => `<a class="ah-chip" href="/en/category/${A(c.slug)}">${e(c.name)}</a>`)));
    if (s.showCountries) groups.push(chips("Countries", d.countries.slice(0, s.countryLimit).map((c) => `<a class="ah-chip" href="/en/country/${A(c.code)}">${countryToFlag(c.code)} ${e(c.name)}</a>`)));
    if (s.showPayments) groups.push(chips("Payments", d.payments.slice(0, s.paymentLimit).map((p) => `<a class="ah-chip" href="/en/payment-methods/${A(p.slug)}">${e(p.name)}</a>`)));
    const body = groups.filter(Boolean).join("");
    return body ? `<div class="ah-filters" id="ah-filters" data-ah-section="filters"><div class="ah-wrap">${body}</div></div>` : "";
  },
  top_picks(s, d, v) {
    const flag = d.country ? countryToFlag(d.country) : "";
    const geoLine = d.countryName ? `<div class="ah-geo">${flag} Showing casinos available in ${e(d.countryName)}</div>` : "";
    const rows = d.picks.map((p, i) => `<li class="ah-pick" data-casino-slug="${A(p.slug)}">
      <span class="ah-pick__rank" aria-hidden="true">${i + 1}</span>
      <div class="ah-pick__brand"><img src="${A(p.logo || "/static/images/default.png")}" alt="${e(p.name)}" loading="lazy" width="56" height="56" onerror="this.src='/static/images/default.png'"><div><h3><a href="/en/casino/${A(p.slug)}">${e(p.name)}</a></h3>${s.showReason && p.reason ? `<span class="ah-reason">${e(p.reason)}</span>` : ""}</div></div>
      <div class="ah-pick__bonus">${p.bonusValue ? `<strong>${e(p.bonusTitle || "Bonus")}</strong><span>${e(p.bonusValue)}</span>` : `<strong>Offer</strong><span>See the casino for the current offer</span>`}<small>${p.terms.length ? e(p.terms.join(" · ")) : "Terms apply"}</small></div>
      ${s.showScore ? `<div class="ah-score" aria-label="Score ${p.rating.toFixed(1)} out of 5"><b>${p.rating.toFixed(1)}</b><span>/5</span><div class="ah-bar"><i style="width:${Math.round(Math.min(5, p.rating) / 5 * 100)}%"></i></div></div>` : "<div></div>"}
      <div class="ah-pick__cta"><a class="btn btn--primary" href="/en/go/${A(p.slug)}" rel="nofollow sponsored">Visit</a><a class="ah-review" href="/en/casino/${A(p.slug)}">Read review</a></div></li>`).join("");
    const body = rows ? `<ol class="ah-picks">${rows}</ol>` : `<div class="ah-empty">No casinos match right now${d.countryName ? ` for ${e(d.countryName)}` : ""}. Check back soon or browse the full list.</div>`;
    const disc = s.disclosure ? `<p class="ah-disclosure">${e(fill(s.disclosure, v))}${s.disclosureUrl && s.disclosureLabel ? ` <a href="${A(s.disclosureUrl)}">${e(s.disclosureLabel)}</a>` : ""}</p>` : "";
    const more = s.viewAllLabel && s.viewAllUrl ? `<div class="ah-more"><a class="btn btn--secondary" href="${A(s.viewAllUrl)}">${e(s.viewAllLabel)}</a></div>` : "";
    return wrap("top_picks", head(fill(s.title, v), fill(s.subtitle, v)) + geoLine + body + disc + more);
  },
  browse(s, d, v) {
    const cards = [];
    if (s.showCategories) d.categories.slice(0, s.categoryLimit).forEach((c) => cards.push(`<a class="ah-card" href="/en/category/${A(c.slug)}"><span class="ah-card__icon" aria-hidden="true">${categoryIcon(c)}</span><b>${e(c.name)}</b></a>`));
    if (s.showCountries) d.countries.slice(0, s.countryLimit).forEach((c) => cards.push(`<a class="ah-card" href="/en/country/${A(c.code)}"><span class="ah-card__icon" aria-hidden="true">${countryToFlag(c.code)}</span><b>${e(c.name)}</b></a>`));
    return cards.length ? wrap("browse", head(fill(s.title, v)) + `<div class="ah-cards">${cards.join("")}</div>`, true) : "";
  },
  payments(s, d, v) {
    const list = d.payments.slice(0, s.limit);
    if (!list.length) return "";
    return wrap("payments", head(fill(s.title, v), s.subtitle, s.viewAllLabel, s.viewAllUrl) + `<div class="ah-pay">${list.map((p) => `<a href="/en/payment-methods/${A(p.slug)}">${p.icon_url ? `<img src="${A(p.icon_url)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ""}<span>${e(p.name)}</span></a>`).join("")}</div>`);
  },
  how_we_rate(s, d, v) {
    const items = s.criteria.map((c) => `<li><b><span>${e(c.label)}</span>${s.weightsConfirmed ? `<span>${c.weight}%</span>` : ""}</b>${s.weightsConfirmed ? `<div class="ah-bar"><i style="width:${c.weight}%"></i></div>` : ""}${c.description ? `<p>${e(c.description)}</p>` : ""}</li>`).join("");
    return wrap("how_we_rate", head(fill(s.title, v), s.intro, s.linkLabel, s.linkUrl) + `<ul class="ah-criteria">${items}</ul>`, true);
  },
  reviews_news(s, d) {
    const reviews = s.showReviews && d.reviews.length ? `<div><h3>${e(s.reviewsTitle)}</h3><div class="ah-list">${d.reviews.map((r) => `<a class="ah-item" href="/en/review/${A(r.slug)}"><img src="${A(r.casino_logo || "/static/images/default.png")}" alt="" loading="lazy" onerror="this.src='/static/images/default.png'"><span><b>${e(r.title)}</b><small>${e(r.casino_name || "")}${r.rating ? ` · ${Number(r.rating).toFixed(1)}/5` : ""}</small></span></a>`).join("")}</div></div>` : "";
    const news = s.showNews && d.news.length ? `<div><h3>${e(s.newsTitle)}</h3><div class="ah-list">${d.news.map((n) => { const dt = new Date(n.published_at || n.created_at); const day = isNaN(dt) ? "" : dt.toISOString().slice(0, 10); const img = n.featured_image_thumbnail || n.featured_image_url; return `<a class="ah-item" href="/en/news/${A(n.slug)}">${img ? `<img src="${A(img)}" alt="" loading="lazy">` : ""}<span><b>${e(n.title)}</b><small>${e(day)}</small></span></a>`; }).join("")}</div></div>` : "";
    return reviews || news ? wrap("reviews_news", `<div class="ah-two">${reviews}${news}</div>`) : "";
  },
  faq(s, d, v) {
    if (!s.items.length) return "";
    const ld = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: s.items.map((i) => ({ "@type": "Question", name: fill(i.q, v), acceptedAnswer: { "@type": "Answer", text: fill(i.a, v) } })) }).replace(/</g, "\\u003c");
    return wrap("faq", head(s.title) + `<div class="ah-faq">${s.items.map((i) => `<details><summary>${e(fill(i.q, v))}</summary><p>${e(fill(i.a, v))}</p></details>`).join("")}</div><script type="application/ld+json">${ld}</script>`, true);
  },
  trust(s) {
    return `<section class="ah-trust" id="ah-trust" data-ah-section="trust"><div class="ah-wrap"><div class="ah-trust__row">${s.showAge ? `<span class="ah-age" aria-label="18 plus">18+</span>` : ""}<div class="ah-trust__text"><h2>${e(s.title)}</h2><p>${e(s.text)}</p></div>
      <div class="ah-chips">${s.pageUrl && s.pageLabel ? `<a class="ah-chip" href="${A(s.pageUrl)}">${e(s.pageLabel)}</a>` : ""}${s.links.map((l) => `<a class="ah-chip" href="${A(l.url)}" target="_blank" rel="noopener nofollow">${e(l.label)}</a>`).join("")}</div></div></div></section>`;
  },
  seo_prose(s) {
    const blocks = String(s.text || "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    if (!blocks.length) return "";
    const html = blocks.map((b) => (b.startsWith("## ") ? `<h3>${e(b.slice(3))}</h3>` : `<p>${e(b).replace(/\n/g, "<br>")}</p>`)).join("");
    return wrap("seo_prose", (s.title ? `<h2>${e(s.title)}</h2>` : "") + `<details class="ah-prose"><summary>${e(s.summaryLabel || "Read more")}</summary><div class="ah-prose__body">${html}</div></details>`);
  },
  newsletter(s) {
    return `<section class="ah-news" id="ah-newsletter" data-ah-section="newsletter"><div class="ah-wrap"><h2>${e(s.title)}</h2><p>${e(s.text)}</p>
      <form class="newsletter-form" novalidate><input type="email" name="email" placeholder="${e(s.placeholder)}" required aria-label="Email address"><button type="submit" class="btn btn--primary">${e(s.button)}</button></form><p class="newsletter-message" style="display:none"></p></div></section>`;
  },
};

// Returns { main, newsletter }: the newsletter goes in its own slot so it can sit directly above the footer.
export function renderAdvancedHome(config, data, ctx = {}) {
  const v = { casino_count: data.casinoCount || "", country: data.countryName || "your location", site_name: ctx.siteName || "", siteHero: Boolean(ctx.siteHero) };
  let main = `<style>${ADVANCED_HOME_CSS}</style>`;
  let newsletter = "";
  for (const s of config.sections) {
    if (!s.enabled) continue;
    const html = R[s.type](s, data, v);
    if (s.type === "newsletter") newsletter = html; else main += html;
  }
  return { main, newsletter };
}
