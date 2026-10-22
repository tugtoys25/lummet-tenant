import { resolvePicks, latestItems, SOURCE_KEYS, RESEARCH_TYPE_LIST } from "../component-sources.js";
import { MAX_GRID_ITEMS, bool, cleanPicks, e, int, link, obj, pickEnum, slugOrEmpty, text } from "./shared.js";

// ---------------------------------------------------------------------------
// content_grid
// ---------------------------------------------------------------------------

export const GRID_DEFAULTS = {
  mode: "picked",
  items: [],
  latest_source: "news",
  latest_type: "",
  latest_sort: "newest",
  limit: 6,
  columns: 3,
  style: "card",
  ratio: "wide",
  show_image: true,
  show_excerpt: true,
  show_rating: true,
  show_bonus: true,
  show_badge: true,
  show_date: false,
  show_button: true,
  button_text: "",
  intro: "",
  align: "left",
  bg: "none",
  more_text: "",
  more_url: ""
};

export function cleanGridSettings(raw) {
  const s = obj(raw);
  const mode = pickEnum(s.mode, ["picked", "latest"], GRID_DEFAULTS.mode);
  const latestSource = pickEnum(s.latest_source, SOURCE_KEYS, GRID_DEFAULTS.latest_source);
  let latestType = String(s.latest_type ?? "").trim();
  if (latestSource === "research") latestType = RESEARCH_TYPE_LIST.includes(latestType) ? latestType : "";
  else if (latestSource === "custom") latestType = slugOrEmpty(latestType);
  else latestType = "";
  return {
    mode,
    items: cleanPicks(s.items, MAX_GRID_ITEMS),
    latest_source: latestSource,
    latest_type: latestType,
    latest_sort: pickEnum(s.latest_sort, ["newest", "rating", "name"], GRID_DEFAULTS.latest_sort),
    limit: int(s.limit, 1, MAX_GRID_ITEMS, GRID_DEFAULTS.limit),
    columns: int(s.columns, 1, 4, GRID_DEFAULTS.columns),
    style: pickEnum(s.style, ["card", "compact", "list", "overlay"], GRID_DEFAULTS.style),
    ratio: pickEnum(s.ratio, ["wide", "standard", "square", "auto"], GRID_DEFAULTS.ratio),
    show_image: bool(s.show_image, GRID_DEFAULTS.show_image),
    show_excerpt: bool(s.show_excerpt, GRID_DEFAULTS.show_excerpt),
    show_rating: bool(s.show_rating, GRID_DEFAULTS.show_rating),
    show_bonus: bool(s.show_bonus, GRID_DEFAULTS.show_bonus),
    show_badge: bool(s.show_badge, GRID_DEFAULTS.show_badge),
    show_date: bool(s.show_date, GRID_DEFAULTS.show_date),
    show_button: bool(s.show_button, GRID_DEFAULTS.show_button),
    button_text: text(s.button_text, 30),
    intro: text(s.intro, 300),
    align: pickEnum(s.align, ["left", "center"], GRID_DEFAULTS.align),
    bg: pickEnum(s.bg, ["none", "soft", "dark"], GRID_DEFAULTS.bg),
    more_text: text(s.more_text, 40),
    more_url: link(s.more_url)
  };
}

export function stars(rating) {
  const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `<span class="cg-card__rating" role="img" aria-label="Rated ${n} out of 5"><span aria-hidden="true">${"★".repeat(n)}${"☆".repeat(5 - n)}</span></span>`;
}

function dateLabel(value) {
  if (!value) return "";
  const d = new Date(String(value).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(value)) ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const BUTTON_DEFAULT = {
  casino: "Read review", news: "Read more", research: "Read more", author: "View profile", update: "Read more",
  sportsbook: "View", affiliate_partner: "View", custom: "View", media: "View"
};

function cardHtml(m, s) {
  const media = s.show_image && m.image
    ? `<a class="cg-card__media" href="${e(m.url)}" tabindex="-1" aria-hidden="true"><img src="${e(m.image)}" alt="" loading="lazy" decoding="async"></a>`
    : "";
  const badge = s.show_badge && m.badge ? `<span class="cg-badge">${e(m.badge)}</span>` : "";
  const rating = s.show_rating && m.rating > 0 ? stars(m.rating) : "";
  const date = s.show_date && m.date && dateLabel(m.date) ? `<time class="cg-card__date">${e(dateLabel(m.date))}</time>` : "";
  const excerpt = s.show_excerpt && m.excerpt ? `<p class="cg-card__excerpt">${e(m.excerpt)}</p>` : "";
  const bonus = s.show_bonus && m.bonus ? `<p class="cg-card__bonus">${e(m.bonus)}</p>` : "";
  let actions = "";
  if (s.show_button && m.source !== "media") {
    const label = s.button_text || BUTTON_DEFAULT[m.source] || "View";
    actions = `<div class="cg-card__actions"><a class="btn btn--primary btn--sm" href="${e(m.url)}">${e(label)}</a>` +
      (m.cta_url ? `<a class="btn cg-btn-alt btn--sm" href="${e(m.cta_url)}" rel="nofollow sponsored noopener" target="_blank">Visit site</a>` : "") + `</div>`;
  }
  const title = m.source === "media"
    ? (m.title ? `<h3 class="cg-card__title">${e(m.title)}</h3>` : "")
    : `<h3 class="cg-card__title"><a href="${e(m.url)}">${e(m.title)}</a></h3>`;
  const mediaOnly = m.source === "media"
    ? `<a class="cg-card__media" href="${e(m.url)}" target="_blank" rel="noopener"><img src="${e(m.image)}" alt="${e(m.title)}" loading="lazy" decoding="async"></a>`
    : media;
  return (
    `<article class="cg-card cg-card--${e(m.source)}">${mediaOnly}` +
    `<div class="cg-card__body">${badge}${title}${rating}${bonus}${excerpt}${date}${actions}</div></article>`
  );
}

/** HTML of a content grid. `db` is the D1 binding; returns "" when there is nothing to show. */
export async function renderContentGrid(db, component) {
  const s = cleanGridSettings(component.settings);
  let items = [];
  if (s.mode === "picked") {
    items = await resolvePicks(db, s.items);
  } else {
    items = await latestItems(db, s.latest_source, { limit: s.limit, sort: s.latest_sort, type: s.latest_type });
  }
  if (!items.length) return "";
  const title = text(component.title, 140);
  const head = title || s.intro
    ? `<div class="cg__head">${title ? `<h2>${e(title)}</h2>` : ""}${s.intro ? `<p class="cg__intro">${e(s.intro)}</p>` : ""}</div>`
    : "";
  const more = s.more_text && s.more_url ? `<p class="cg__more"><a href="${e(s.more_url)}">${e(s.more_text)} <span aria-hidden="true">&rarr;</span></a></p>` : "";
  const cls = `component-grid cg cg--bg-${s.bg} cg--cols-${s.columns} cg--style-${s.style} cg--ratio-${s.ratio} cg--align-${s.align}`;
  const inner = `${head}<div class="cg__grid">${items.map((m) => cardHtml(m, s)).join("")}</div>${more}`;
  return `<section class="${cls}">${wrap(inner, component)}</section>`;
}

/** Full-width slots (top, bottom) get the site container; other slots already sit inside one. */
export function wrap(inner, component) {
  const point = component && component.injection_point;
  return point === "top" || point === "bottom" ? `<div class="container">${inner}</div>` : inner;
}
