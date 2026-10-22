// Sections ("review blocks") and rich body text for generic reviews
// (sportsbook / affiliate partner / custom).
//
// A section is a titled block shown after the review's main content. It is
// stored in the existing review_blocks table, in the `content` column:
//   - plain HTML                         -> a rich-text section (how it always was)
//   - "lmsec:" + JSON {type, ...}        -> a typed section (FAQ, images, payment methods, ...)
// so no migration is needed and older sections keep working untouched.
//
// Types: rich, faq, media, payments, picks, cards, callout, stats.
// Everything a person types is validated here (lengths, counts, allowed
// choices, links) and escaped or sanitized again when the page is built.
import { sanitizeHtml, sanitizeUrl, escapeHtml } from "./sanitize.js";
import { resolvePicks, isSource, isValidKey } from "./component-sources.js";

export const MAX_SECTIONS = 30;
export const MAX_SECTION_TITLE = 120;
export const MAX_SECTION_CONTENT = 100000;
export const SECTION_TYPES = ["rich", "faq", "media", "payments", "picks", "cards", "callout", "stats"];
const PREFIX = "lmsec:";

const HAS_TAG = /<\/?[a-z][\s\S]*?>/i;
const esc = (s) => escapeHtml(String(s == null ? "" : s));

/** Keeps wide tables from breaking the page: they scroll sideways inside their own box. */
export function wrapTables(html) {
  return String(html).replace(/<table\b/gi, '<div class="table-scroll" role="region" tabindex="0" aria-label="Scrollable table"><table').replace(/<\/table>/gi, "</table></div>");
}

export function toRichHtml(text) {
  const s = String(text == null ? "" : text);
  if (!s.trim()) return "";
  if (HAS_TAG.test(s)) return wrapTables(sanitizeHtml(s));
  return s.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("\n");
}

// ---------------------------------------------------------------- cleaning helpers
const str = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
const url = (v) => { const u = sanitizeUrl(String(v == null ? "" : v).trim().slice(0, 600)); return typeof u === "string" ? u : ""; };
const imgUrl = (v) => { const u = sanitizeUrl(String(v == null ? "" : v).trim().slice(0, 600), true); return typeof u === "string" ? u : ""; };
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const richHtml = (v) => { const s = String(v == null ? "" : v).slice(0, MAX_SECTION_CONTENT); return s; };
const hasText = (html) => !!String(html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() || /<(img|iframe|video|table)\b/i.test(String(html || ""));

const CLEANERS = {
  rich(d) {
    return { html: richHtml(d.html), size: pick(d.size, ["s", "m", "l"], "m"), align: pick(d.align, ["left", "center", "justify"], "left"), width: pick(d.width, ["full", "narrow"], "full") };
  },
  faq(d) {
    const items = list(d.items, 40).map((i) => ({ q: str(i && i.q, 240), a: str(i && i.a, 4000) })).filter((i) => i.q && i.a);
    return { items, open_first: !!d.open_first };
  },
  media(d) {
    const images = list(d.images, 24).map((i) => ({ src: imgUrl(i && i.src), alt: str(i && i.alt, 200), caption: str(i && i.caption, 300), link: url(i && i.link) })).filter((i) => i.src);
    return {
      images, text_html: richHtml(d.text_html),
      layout: pick(d.layout, ["single", "grid2", "grid3", "grid4"], images.length > 1 ? "grid3" : "single"),
      fit: pick(d.fit, ["cover", "contain"], "cover"), ratio: pick(d.ratio, ["auto", "16:9", "4:3", "1:1"], "auto"),
      size: pick(d.size, ["full", "large", "medium", "small"], "full"), align: pick(d.align, ["left", "center", "right"], "center"),
      text_position: pick(d.text_position, ["after", "before"], "after")
    };
  },
  payments(d) {
    const seen = new Set(); const ids = [];
    for (const v of list(d.ids, 80)) { const n = parseInt(v, 10); if (n > 0 && !seen.has(n)) { seen.add(n); ids.push(n); } }
    return { ids, layout: pick(d.layout, ["chips", "grid", "list"], "chips"), text_html: richHtml(d.text_html), text_position: pick(d.text_position, ["after", "before"], "after") };
  },
  picks(d) {
    const items = [];
    for (const i of list(d.items, 24)) {
      if (!i || typeof i !== "object") continue;
      if (i.source) {
        if (!isSource(String(i.source)) || !isValidKey(String(i.source), i.key)) continue;
        const e = { source: String(i.source), key: String(i.key) }; const l = str(i.label, 160); if (l) e.label = l; items.push(e);
      } else {
        const u = url(i.url); const l = str(i.label, 160);
        if (u && l) items.push({ url: u, label: l, kind: str(i.kind, 30) });
      }
    }
    return { items, intro_html: richHtml(d.intro_html), layout: pick(d.layout, ["cards", "grid", "list", "compact"], "cards"), columns: pick(parseInt(d.columns, 10), [2, 3, 4], 3) };
  },
  cards(d) {
    const cards = list(d.cards, 24).map((c) => ({ title: str(c && c.title, 140), text: str(c && c.text, 1200), image: imgUrl(c && c.image), url: url(c && c.url), cta: str(c && c.cta, 40) })).filter((c) => c.title || c.text || c.image);
    return { cards, columns: pick(parseInt(d.columns, 10), [1, 2, 3, 4], 3), style: pick(d.style, ["outlined", "filled", "plain"], "outlined") };
  },
  callout(d) {
    return { tone: pick(d.tone, ["info", "tip", "warning", "success"], "info"), title: str(d.title, 140), text: str(d.text, 3000) };
  },
  stats(d) {
    return { items: list(d.items, 12).map((i) => ({ value: str(i && i.value, 40), label: str(i && i.label, 100) })).filter((i) => i.value || i.label) };
  }
};

function isEmptyData(type, d) {
  if (type === "rich") return !hasText(d.html);
  if (type === "faq") return !d.items.length;
  if (type === "media") return !d.images.length && !hasText(d.text_html);
  if (type === "payments") return !d.ids.length && !hasText(d.text_html);
  if (type === "picks") return !d.items.length && !hasText(d.intro_html);
  if (type === "cards") return !d.cards.length;
  if (type === "callout") return !d.title && !d.text;
  if (type === "stats") return !d.items.length;
  return true;
}

/** Stored text -> { type, data }. Plain HTML (and anything unreadable) is a rich section. */
export function parseSection(content) {
  const s = String(content == null ? "" : content);
  if (s.startsWith(PREFIX)) {
    try {
      const j = JSON.parse(s.slice(PREFIX.length));
      if (j && SECTION_TYPES.includes(j.type)) return { type: j.type, data: CLEANERS[j.type](j), hidden: j.hidden === true };
    } catch { /* fall through: treat as text */ }
  }
  return { type: "rich", data: { html: s, size: "m", align: "left", width: "full" }, hidden: false };
}

/** { type, data } -> the text kept in review_blocks.content */
export function serializeSection(type, data, hidden = false) {
  const clean = CLEANERS[type](data || {});
  if (!hidden && type === "rich" && clean.size === "m" && clean.align === "left" && clean.width === "full") return clean.html;
  return PREFIX + JSON.stringify({ type, ...clean, ...(hidden ? { hidden: true } : {}) });
}

/**
 * Validates what the editor sends: a list of { title, type?, data? } (or the older
 * { title, content }). Returns { sections: [{title, content}] } ready to store, or { error }.
 * Sections with no title and nothing in them are dropped.
 */
export function cleanSections(input) {
  if (!Array.isArray(input)) return { error: "sections must be a list" };
  const out = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const title = String(raw.title == null ? "" : raw.title).trim();
    let type = "rich", data, hidden = false;
    if (raw.type && raw.data !== undefined) {
      if (!SECTION_TYPES.includes(raw.type)) return { error: `Unknown section type "${String(raw.type).slice(0, 30)}".` };
      type = raw.type; data = CLEANERS[type](raw.data && typeof raw.data === "object" ? raw.data : {});
    } else {
      const parsed = parseSection(raw.content); type = parsed.type; data = parsed.data; hidden = parsed.hidden;
    }
    if (raw.hidden !== undefined) hidden = raw.hidden === true || raw.hidden === 1 || raw.hidden === "1";
    if (isEmptyData(type, data)) { if (!title) continue; }
    if (!title) return { error: "Every section needs a title." };
    if (title.length > MAX_SECTION_TITLE) return { error: `Section titles can be at most ${MAX_SECTION_TITLE} characters.` };
    const content = serializeSection(type, data, hidden);
    if (content.length > MAX_SECTION_CONTENT * 2) return { error: `"${title}" is too long.` };
    out.push({ title, content });
  }
  if (out.length > MAX_SECTIONS) return { error: `A review can have at most ${MAX_SECTIONS} sections.` };
  return { sections: out };
}

/** For the editor: a stored block -> { id, title, position, type, data, content } */
export function describeBlock(b) {
  const { type, data, hidden } = parseSection(b.content);
  return { id: b.id, title: b.title, position: b.position, type, data, hidden: !!hidden, content: b.content };
}

// ---------------------------------------------------------------- public rendering
export function sectionAnchor(title, index) {
  const base = String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `section-${index + 1}${base ? "-" + base : ""}`;
}

function safeLink(u) { const s = url(u); return s ? esc(s) : ""; }
const rel = (u) => (/^https?:/i.test(u) ? ' target="_blank" rel="noopener noreferrer"' : "");

async function renderBody(db, type, d) {
  if (type === "rich") {
    const cls = ["rv-rich", d.size !== "m" ? `rv-size-${d.size}` : "", d.align !== "left" ? `rv-align-${d.align}` : "", d.width === "narrow" ? "rv-narrow" : ""].filter(Boolean).join(" ");
    const body = toRichHtml(d.html);
    return body ? `<div class="${cls}">${body}</div>` : "";
  }
  if (type === "faq") {
    if (!d.items.length) return "";
    return `<div class="rv-faq">${d.items.map((i, n) => `<details class="rv-faq__item"${d.open_first && n === 0 ? " open" : ""}><summary>${esc(i.q)}</summary><div class="rv-faq__a">${toRichHtml(i.a)}</div></details>`).join("")}</div>`;
  }
  if (type === "media") {
    const figs = d.images.map((i) => {
      const img = `<img src="${esc(i.src)}" alt="${esc(i.alt)}" loading="lazy" decoding="async">`;
      const inner = i.link ? `<a href="${safeLink(i.link)}"${rel(i.link)}>${img}</a>` : img;
      return `<figure class="rv-media__fig">${inner}${i.caption ? `<figcaption>${esc(i.caption)}</figcaption>` : ""}</figure>`;
    }).join("");
    const text = toRichHtml(d.text_html);
    const gal = figs ? `<div class="rv-media rv-media--${d.layout} rv-fit-${d.fit} rv-ratio-${d.ratio.replace(":", "x")} rv-msize-${d.size} rv-malign-${d.align}">${figs}</div>` : "";
    const t = text ? `<div class="rv-rich rv-media__text">${text}</div>` : "";
    return d.text_position === "before" ? t + gal : gal + t;
  }
  if (type === "payments") {
    let rows = [];
    if (d.ids.length) {
      try {
        const r = await db.prepare(`SELECT id, slug, name, icon_url FROM payment_methods WHERE id IN (${d.ids.map(() => "?").join(",")}) AND published IS NOT 0`).bind(...d.ids).all();
        const byId = new Map((r.results || []).map((x) => [x.id, x]));
        rows = d.ids.map((id) => byId.get(id)).filter(Boolean);
      } catch { rows = []; }
    }
    const items = rows.map((m) => {
      const icon = m.icon_url ? `<img src="${esc(m.icon_url)}" alt="" loading="lazy" onerror="this.remove()">` : `<span class="rv-pay__ph" aria-hidden="true">${esc(m.name.slice(0, 1))}</span>`;
      return `<li><a href="/en/payment-methods/${encodeURIComponent(m.slug)}">${icon}<span>${esc(m.name)}</span></a></li>`;
    }).join("");
    const list_ = items ? `<ul class="rv-pay rv-pay--${d.layout}">${items}</ul>` : "";
    const text = toRichHtml(d.text_html);
    const t = text ? `<div class="rv-rich">${text}</div>` : "";
    return d.text_position === "before" ? t + list_ : list_ + t;
  }
  if (type === "picks") {
    const resolved = await resolvePicks(db, d.items.filter((i) => i.source));
    const byId = new Map(resolved.map((c) => [`${c.source}:${c.key}`, c]));
    // keep the order the editor chose, mixing picked items and plain links
    const cards = [];
    for (const i of d.items) {
      if (i.source) { const c = byId.get(`${i.source}:${i.key}`); if (c) cards.push(i.label ? { ...c, title: i.label } : c); }
      else cards.push({ title: i.label, url: i.url, image: "", kind: i.kind });
    }
    const intro = toRichHtml(d.intro_html);
    const head = intro ? `<div class="rv-rich">${intro}</div>` : "";
    if (!cards.length) return head;
    const li = cards.map((c) => {
      const img = c.image ? `<span class="rv-pick__img"><img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.parentNode.remove()"></span>` : "";
      const meta = [c.badge ? `<em>${esc(c.badge)}</em>` : "", c.rating ? `<span class="rv-pick__rating">★ ${Number(c.rating).toFixed(1)}</span>` : ""].filter(Boolean).join(" ");
      const ex = d.layout === "compact" || !c.excerpt ? "" : `<span class="rv-pick__text">${esc(c.excerpt)}</span>`;
      return `<li><a href="${safeLink(c.url) || "#"}"${rel(c.url || "")}>${img}<span class="rv-pick__body"><strong>${esc(c.title)}</strong>${meta ? `<span class="rv-pick__meta">${meta}</span>` : ""}${ex}</span></a></li>`;
    }).join("");
    return `${head}<ul class="rv-picks rv-picks--${d.layout} rv-cols-${d.columns}">${li}</ul>`;
  }
  if (type === "cards") {
    if (!d.cards.length) return "";
    const li = d.cards.map((c) => {
      const img = c.image ? `<div class="rv-card__img"><img src="${esc(c.image)}" alt="" loading="lazy"></div>` : "";
      const body = `${img}<div class="rv-card__body">${c.title ? `<h3>${esc(c.title)}</h3>` : ""}${c.text ? `<p>${esc(c.text).replace(/\n/g, "<br>")}</p>` : ""}${c.url && c.cta ? `<span class="rv-card__cta">${esc(c.cta)} &rarr;</span>` : ""}</div>`;
      return `<li class="rv-card">${c.url ? `<a href="${safeLink(c.url)}"${rel(c.url)}>${body}</a>` : body}</li>`;
    }).join("");
    return `<ul class="rv-cards rv-cards--${d.style} rv-cols-${d.columns}">${li}</ul>`;
  }
  if (type === "callout") {
    if (!d.title && !d.text) return "";
    return `<aside class="rv-callout rv-callout--${d.tone}">${d.title ? `<strong>${esc(d.title)}</strong>` : ""}${d.text ? `<p>${esc(d.text).replace(/\n/g, "<br>")}</p>` : ""}</aside>`;
  }
  if (type === "stats") {
    if (!d.items.length) return "";
    return `<dl class="rv-stats">${d.items.map((i) => `<div><dt>${esc(i.label)}</dt><dd>${esc(i.value)}</dd></div>`).join("")}</dl>`;
  }
  return "";
}

/**
 * The public markup for a review's sections, in order.
 * Returns { html, nav: [{id, title}], faq: [{q, a}] }.
 * A section with nothing to show is left out (and so is its navigation entry).
 */
export async function renderSections(db, blocks) {
  const out = { html: "", nav: [], faq: [] };
  if (!Array.isArray(blocks) || !blocks.length) return out;
  const parts = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const { type, data, hidden } = parseSection(b.content);
    if (hidden) continue; // switched off in the editor: no content and no tab
    const body = await renderBody(db, type, data);
    if (!body) continue;
    const id = sectionAnchor(b.title, i);
    parts.push(`<div class="info-block review-section rv-sec rv-sec--${type}" id="${id}"><h2>${esc(b.title || "")}</h2><div class="review-section__body">${body}</div></div>`);
    out.nav.push({ id, title: String(b.title || "").slice(0, 60) });
    if (type === "faq") for (const q of data.items) out.faq.push({ q: q.q, a: q.a });
  }
  out.html = parts.join("\n");
  return out;
}

/** Back-compat helper: just the markup. */
export async function renderSectionsHtml(db, blocks) {
  return (await renderSections(db, blocks)).html;
}

/** schema.org FAQPage for every question and answer in the review's FAQ sections. */
export function faqSchemaScript(faq) {
  if (!faq || !faq.length) return "";
  const json = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.slice(0, 60).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

/** Navigation entries for the top bar, in page order. */
export function buildReviewNav({ hasSummary = true, hasScoring = false, hasOverview = true, sections = [], hasProsCons = true, hasVerdict = false }) {
  const nav = [];
  if (hasSummary) nav.push({ id: "summary", title: "Summary" });
  if (hasScoring) nav.push({ id: "scoring", title: "How we scored it" });
  if (hasOverview) nav.push({ id: "overview", title: "Overview" });
  for (const s of sections) nav.push(s);
  if (hasProsCons) nav.push({ id: "pros-cons", title: "Pros & Cons" });
  if (hasVerdict) nav.push({ id: "verdict", title: "Verdict" });
  return nav;
}

export function renderSectionNav(items, label = "On this page") {
  if (!Array.isArray(items) || items.length < 2) return "";
  return `<nav class="sn-nav" data-sn aria-label="${esc(label)}"><div class="sn-nav__track">${items.map((i) => `<a href="#${esc(i.id)}" class="sn-nav__link" data-sn-id="${esc(i.id)}">${esc(i.title)}</a>`).join("")}</div></nav>`;
}
