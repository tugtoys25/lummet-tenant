// Everything an author has published, grouped, for the public author page.
// Each group is read on its own and wrapped in try/catch, so one table that
// is missing or misbehaving never takes the whole page down. Only content
// that is live to the public is counted or shown.
import { escapeHtml } from "./sanitize.js";
import { reviewPublicUrl } from "./review-urls.js";

const SHOW_FIRST = 6;     // cards shown at once per group
const FETCH_MAX = 60;     // rows read per group

const esc = (s) => escapeHtml(String(s == null ? "" : s));
const day = (d) => { const t = d ? new Date(String(d).replace(" ", "T") + (String(d).includes("Z") ? "" : "Z")) : null; return t && !isNaN(t) ? t.toISOString().slice(0, 10) : ""; };
const clip = (s, n) => { const t = String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const rating = (r) => (Number(r) > 0 ? `★ ${Number(r).toFixed(1)}` : "");

const TYPE_LABEL = { sportsbook: "Sportsbook", affiliate_partner: "Affiliate partner", custom: "Content" };
function itemUrl(r) {
  const s = encodeURIComponent(r.slug);
  if (r.content_type === "sportsbook") return `/en/sportsbook/${s}`;
  if (r.content_type === "affiliate_partner") return `/en/affiliate-partner/${s}`;
  if (r.content_type === "custom" && r.custom_type_slug) return `/en/custom/${encodeURIComponent(r.custom_type_slug)}/${s}`;
  return null;
}

const GROUPS = [
  { key: "casino-reviews", label: "Casino reviews", noun: "casino review", sql: {
    from: `FROM reviews r LEFT JOIN casinos c ON c.slug = r.casino_slug
           WHERE r.author_id = ? AND r.published = 1 AND (r.reviewed_content_type IS NULL OR r.reviewed_content_type = 'casino')`,
    cols: `r.slug, r.title, r.rating, r.created_at, r.updated_at, c.name AS subject, c.logo AS image`, order: `COALESCE(r.updated_at, r.created_at)` },
    map: (r) => ({ title: r.title, url: `/en/review/${encodeURIComponent(r.slug)}`, image: r.image, meta: [r.subject, rating(r.rating)].filter(Boolean).join(" · "), date: r.updated_at || r.created_at }) },
  { key: "other-reviews", label: "Other reviews", noun: "review", sql: {
    from: `FROM reviews r LEFT JOIN content_items ci ON ci.id = r.reviewed_content_id
           LEFT JOIN media_library lm ON lm.id = ci.logo_media_id
           WHERE r.author_id = ? AND r.published = 1 AND r.reviewed_content_type IN ('sportsbook', 'affiliate_partner', 'custom')`,
    cols: `r.slug, r.title, r.rating, r.created_at, r.updated_at, r.reviewed_content_type, ci.custom_type_slug, ci.name AS subject, lm.url AS image`, order: `COALESCE(r.updated_at, r.created_at)` },
    map: (r) => ({ title: r.title, url: reviewPublicUrl(r), image: r.image, meta: [r.subject, rating(r.rating)].filter(Boolean).join(" · "), date: r.updated_at || r.created_at, badge: TYPE_LABEL[r.reviewed_content_type] }) },
  { key: "research", label: "Research", noun: "research item", sql: {
    from: `FROM research_items ri LEFT JOIN media_library m ON m.id = ri.og_image WHERE ri.author_id = ? AND ri.published = 1 AND ri.status != 'draft'`,
    cols: `ri.type, ri.slug, ri.title, ri.excerpt, ri.updated_at, ri.created_at, COALESCE(m.url, m.thumbnail_url) AS image, m.thumbnail_url AS image_alt`, order: `COALESCE(ri.updated_at, ri.created_at)` },
    map: (r) => ({ title: r.title, image: r.image, image_alt: r.image_alt, url: `/en/research/${encodeURIComponent(r.type)}/${encodeURIComponent(r.slug)}`, excerpt: clip(r.excerpt, 140), date: r.updated_at || r.created_at, badge: String(r.type || "").replace(/[-_]/g, " ") }) },
  { key: "news", label: "News and articles", noun: "article", sql: {
    from: `FROM news n LEFT JOIN media_library m ON m.id = n.featured_image
           WHERE n.author_id = ? AND n.published = 1 AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))`,
    cols: `n.slug, n.title, n.excerpt, n.created_at, n.updated_at, COALESCE(m.url, m.thumbnail_url) AS image, m.thumbnail_url AS image_alt`, order: `n.created_at` },
    map: (r) => ({ title: r.title, url: `/en/news/${encodeURIComponent(r.slug)}`, image: r.image, image_alt: r.image_alt, excerpt: clip(r.excerpt, 140), date: r.created_at }) },
  { key: "updates", label: "Platform updates", noun: "update", sql: {
    from: `FROM platform_updates pu LEFT JOIN media_library m ON m.id = pu.featured_image WHERE pu.author_id = ? AND pu.published = 1`,
    cols: `pu.slug, pu.title, pu.excerpt, pu.published_at, pu.created_at, COALESCE(m.url, m.thumbnail_url) AS image, m.thumbnail_url AS image_alt`, order: `COALESCE(pu.published_at, pu.created_at)` },
    map: (r) => ({ title: r.title, image: r.image, image_alt: r.image_alt, url: `/en/updates/${encodeURIComponent(r.slug)}`, excerpt: clip(r.excerpt, 140), date: r.published_at || r.created_at }) },
  { key: "content", label: "Sportsbooks, partners and more", noun: "listing", sql: {
    from: `FROM content_items ci LEFT JOIN media_library lm ON lm.id = ci.logo_media_id WHERE ci.author_id = ? AND ci.published = 1 AND ci.status = 'published'`,
    cols: `ci.content_type, ci.custom_type_slug, ci.slug, ci.name, ci.rating, lm.url AS image, ci.updated_at, ci.created_at`, order: `COALESCE(ci.updated_at, ci.created_at)` },
    map: (r) => ({ title: r.name, url: itemUrl(r), image: r.image, meta: rating(r.rating), date: r.updated_at || r.created_at, badge: TYPE_LABEL[r.content_type] }) },
  { key: "comparisons", label: "Comparisons", noun: "comparison", sql: {
    from: `FROM comparisons WHERE author_id = ? AND status = 'published'`,
    cols: `content_type, slug, title, description, updated_at, created_at`, order: `COALESCE(updated_at, created_at)` },
    map: (r) => ({ title: r.title, url: `/en/compare/${encodeURIComponent(r.content_type)}/${encodeURIComponent(r.slug)}`, excerpt: clip(r.description, 140), date: r.updated_at || r.created_at }) },
  { key: "country-pages", label: "Country and category pages", noun: "country or category page", sql: {
    from: `FROM seo_pages WHERE author_id = ? AND published = 1`,
    cols: `page_type, slug, country_code, title, COALESCE(NULLIF(featured_image, ''), NULLIF(og_image, '')) AS image, updated_at, created_at`, order: `COALESCE(updated_at, created_at)` },
    map: (r) => ({ title: r.title, image: /^(\/|https?:)/.test(r.image || "") ? r.image : "", url: r.page_type === "country_custom" ? `/en/country/${encodeURIComponent(r.country_code)}/${encodeURIComponent(r.slug)}` : `/en/category/${encodeURIComponent(r.slug)}/${encodeURIComponent(r.country_code)}`, meta: r.country_code, date: r.updated_at || r.created_at, badge: r.page_type === "country_custom" ? "Country" : "Category" }) },
  { key: "best-lists", label: "Best-of lists", noun: "list", sql: {
    from: `FROM content_landing_pages WHERE author_id = ? AND status = 'published'`,
    cols: `slug, title, description, updated_at, created_at`, order: `COALESCE(updated_at, created_at)` },
    map: (r) => ({ title: r.title, url: `/en/best/${encodeURIComponent(r.slug)}`, excerpt: clip(r.description, 140), date: r.updated_at || r.created_at }) },
  { key: "pages", label: "Pages", noun: "page", sql: {
    from: `FROM pages WHERE author_id = ? AND published = 1`,
    cols: `slug, title, created_at, updated_at`, order: `COALESCE(updated_at, created_at)` },
    map: (r) => ({ title: r.title, url: `/en/${encodeURIComponent(r.slug)}`, date: r.updated_at || r.created_at }) }
];

/** [{ key, label, noun, count, items: [{title,url,image,meta,excerpt,date,badge}] }] — only groups that have something */
export async function getAuthorHub(db, authorId) {
  const out = [];
  for (const g of GROUPS) {
    try {
      const rows = (await db.prepare(`SELECT ${g.sql.cols} ${g.sql.from} ORDER BY ${g.sql.order} DESC LIMIT ${FETCH_MAX}`).bind(authorId).all()).results || [];
      if (!rows.length) continue;
      let count = rows.length;
      if (rows.length >= FETCH_MAX) { const c = await db.prepare(`SELECT COUNT(*) n ${g.sql.from}`).bind(authorId).first(); count = (c && c.n) || rows.length; }
      const items = rows.map(g.map).filter((i) => i && i.url && i.title);
      if (items.length) out.push({ key: g.key, label: g.label, noun: g.noun, count, items });
    } catch (err) { console.error("author hub group failed:", g.key, err && err.message); }
  }
  return out;
}

function card(it) {
  const alt = it.image_alt && it.image_alt !== it.image ? ` data-alt="${esc(it.image_alt)}"` : "";
  const img = it.image ? `<span class="ah-card__img"><img src="${esc(it.image)}"${alt} alt="" loading="lazy" onerror="var a=this.getAttribute('data-alt');if(a&&this.src.indexOf(a)<0){this.removeAttribute('data-alt');this.src=a}else{this.parentNode.remove()}"></span>` : "";
  const badge = it.badge ? `<span class="ah-card__badge">${esc(it.badge)}</span>` : "";
  return `<li class="ah-card"><a href="${esc(it.url)}">${img}<span class="ah-card__body">${badge}<strong>${esc(it.title)}</strong>${it.meta ? `<span class="ah-card__meta">${esc(it.meta)}</span>` : ""}${it.excerpt ? `<span class="ah-card__text">${esc(it.excerpt)}</span>` : ""}${day(it.date) ? `<time datetime="${esc(day(it.date))}">${esc(day(it.date))}</time>` : ""}</span></a></li>`;
}

/** { total, stats_html, nav, sections_html } for the author template */
export function renderAuthorHub(groups, authorName) {
  const total = groups.reduce((n, g) => n + g.count, 0);
  const stats = groups.map((g) => `<a class="ah-stat" href="#ah-${esc(g.key)}"><span class="ah-stat__n">${g.count}</span><span class="ah-stat__l">${esc(g.label)}</span></a>`).join("");
  const stats_html = groups.length ? `<div class="ah-stats" role="list" aria-label="Published by ${esc(authorName)}">${stats}</div>` : "";
  const sections_html = groups.map((g) => {
    const first = g.items.slice(0, SHOW_FIRST), rest = g.items.slice(SHOW_FIRST);
    const more = rest.length ? `<details class="ah-more"><summary>Show ${rest.length}${g.count > g.items.length ? "+" : ""} more</summary><ul class="ah-grid">${rest.map(card).join("")}</ul></details>` : "";
    return `<section class="ah-section" id="ah-${esc(g.key)}"><h2>${esc(g.label)} <span class="ah-count">${g.count}</span></h2><ul class="ah-grid">${first.map(card).join("")}</ul>${more}</section>`;
  }).join("");
  return { total, stats_html, nav: groups.map((g) => ({ id: `ah-${g.key}`, title: `${g.label} (${g.count})` })), sections_html };
}
