// ============================================================
// en/worker/newsroom-home.js  --  Stage G: News homepage v2 (flag news_v2_homepage)
//
// loadHomepage(): independent, fail-soft queries run in parallel.
// renderHomepage(): PURE HTML builder; every dynamic value goes through esc().
// A block with no content is never rendered (the page degrades to fewer
// blocks, down to a simple "no articles yet" message).
// No JavaScript is required: the ranked lists use <details>, images are
// lazy except the lead, and every image carries width/height (no layout shift).
// ============================================================

import { esc, collectBadges, renderArticleCard, attachSectionNames as nrRenderAttach } from './newsroom-render.js';
import { CARD_COLUMNS, getMostRead, getPinned, getTrending, MOST_READ_WINDOWS } from './newsroom-stats.js';
import { getPublishedTrustPages, TRUST_PAGES } from './newsroom-trust.js';
import { getCountryByCode } from './database/newsroom.js';
import { renderTime } from './news-time.js';

const LIVE = `n.published = 1 AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))`;
const JOINS = `LEFT JOIN media_library m ON m.id = n.featured_image LEFT JOIN authors a ON a.id = n.author_id`;
const ORDER = `COALESCE(n.published_at, n.created_at) DESC, n.id DESC`;
const ANALYSIS_TYPES = ['analysis', 'research', 'opinion', 'explainer', 'feature', 'interview', 'investigation'];
const MAX_SECTION_BLOCKS = 6;

const soft = (label, p, fallback) => p.catch((e) => { console.error(`news home ${label} failed:`, e.message); return fallback; });

export async function loadHomepage(db, env, flags) {
  const q = async (sql, ...p) => (await db.prepare(sql).bind(...p).all()).results || [];

  const [leadPins, featuredPins, latestRows, sectionRows, analysis, mostRead, trending, trust] = await Promise.all([
    soft('lead pins', getPinned(db, 'lead'), []),
    soft('featured pins', getPinned(db, 'featured'), []),
    // NOT soft: if the core article query fails, throw so the controller serves the existing page
    // instead of a misleading "no articles yet" (which would also be noindex + edge-cached).
    q(`SELECT ${CARD_COLUMNS} FROM news n ${JOINS} WHERE ${LIVE} ORDER BY ${ORDER} LIMIT 30`),
    flags.news_new_taxonomy ? soft('sections', q(`
      SELECT s.id AS sec_id, s.slug AS sec_slug, s.name AS sec_name, s.display_order, x.* FROM news_sections s
      JOIN (
        SELECT ${CARD_COLUMNS}, ROW_NUMBER() OVER (PARTITION BY n.section_id ORDER BY ${ORDER}) AS rn
        FROM news n ${JOINS} WHERE n.section_id IS NOT NULL AND ${LIVE}
      ) x ON x.section_id = s.id AND x.rn <= 4
      WHERE s.active = 1 ORDER BY s.display_order, s.name, x.rn`), []) : [],
    flags.news_new_taxonomy ? soft('analysis', q(`SELECT ${CARD_COLUMNS} FROM news n ${JOINS}
      WHERE ${LIVE} AND n.article_type IN (${ANALYSIS_TYPES.map(() => '?').join(',')}) ORDER BY ${ORDER} LIMIT 4`, ...ANALYSIS_TYPES), []) : [],
    Promise.all(Object.keys(MOST_READ_WINDOWS).map(async (k) => [k, await getMostRead(db, env, k, 5)])),
    flags.news_trending ? getTrending(db, env, 5) : [],
    soft('trust', getPublishedTrustPages(db), [])
  ]);
  const nav = (flags.news_new_taxonomy || flags.news_search_v2)
    ? await soft('nav', loadNewsNav(db, { taxonomy: !!flags.news_new_taxonomy, dates: !!flags.news_search_v2 }), null) : null;

  // Lead: editor pin > newest article with an image > newest article.
  const lead = leadPins[0] || latestRows.find((a) => a.featured_image_url) || latestRows[0] || null;
  const taken = new Set(lead ? [lead.id] : []);
  const featured = featuredPins.filter((a) => !taken.has(a.id)); featured.forEach((a) => taken.add(a.id));
  const latest = [...featured, ...latestRows.filter((a) => !taken.has(a.id))].slice(0, 9);
  latest.forEach((a) => taken.add(a.id));

  const bySection = new Map();
  for (const r of sectionRows) {
    if (!bySection.has(r.sec_id)) bySection.set(r.sec_id, { id: r.sec_id, slug: r.sec_slug, name: r.sec_name, articles: [] });
    bySection.get(r.sec_id).articles.push(r);
  }
  const sections = [...bySection.values()].slice(0, MAX_SECTION_BLOCKS);
  // Editor pins for a section block (slot "section:<id>") come first; the automatic picks fill the rest.
  // No pins, or a failed lookup, leaves the block exactly as it was.
  await Promise.all(sections.map(async (s) => {
    const pins = await soft(`section pins ${s.id}`, getPinned(db, `section:${s.id}`), []);
    if (!pins.length) return;
    const pinnedIds = new Set(pins.map((p) => p.id));
    s.articles = [...pins, ...s.articles.filter((a) => !pinnedIds.has(a.id))].slice(0, 4);
  }));
  if (flags.news_card_sections) {
    // Only the cards that do not already sit under their own section heading need the label.
    await nrRenderAttach(db, [lead, ...latest, ...analysis].filter(Boolean));
  }
  return {
    lead, latest,
    sections,
    analysis: analysis.filter((a) => a.id !== lead?.id),
    mostRead: Object.fromEntries(mostRead),
    trending, trust, nav
  };
}

// Menu under the search box: a Sections dropdown, a Topics dropdown, and a few inline chips for
// the busiest entries. Only sections/topics that actually have published articles are listed, so an
// empty or switched-off one never shows up. Read live from the database on each (edge-cached)
// render, so new sections/topics appear without a deploy.
// A parent section counts its children's articles, like its landing page does.
const NAV_MAX_TOPICS = 40;
const NAV_POPULAR = 4;
const NAV_MAX_COUNTRIES = 60;
export async function loadNewsNav(db, { taxonomy = true, dates = false } = {}) {
  // The date menu needs search v2; sections/topics/regions/countries need the taxonomy pages. Either can be on alone.
  if (!taxonomy) return { sections: [], topics: [], regions: [], countries: [], popular: [], dates };
  const q = async (sql) => (await db.prepare(sql).all()).results || [];
  // Regions and countries are extras: if their lookup fails the rest of the menu still shows.
  const extra = (sql) => q(sql).catch((e) => { console.error('news nav extra failed:', e.message); return []; });
  const [secs, counts, topics, regionRows, countryRows] = await Promise.all([
    q(`SELECT id, slug, name, parent_id FROM news_sections WHERE active = 1 ORDER BY display_order, name`),
    q(`SELECT n.section_id AS id, COUNT(*) AS c FROM news n WHERE n.section_id IS NOT NULL AND ${LIVE} GROUP BY n.section_id`),
    q(`SELECT t.slug, t.name, COUNT(*) AS c FROM news_topics t
       JOIN news_article_topics x ON x.topic_id = t.id JOIN news n ON n.id = x.news_id
       WHERE t.active = 1 AND ${LIVE} GROUP BY t.id ORDER BY c DESC, t.name LIMIT ${NAV_MAX_TOPICS}`),
    // Same matching as the region / country pages (see getRegionArticles / getCountryArticles).
    extra(`SELECT r.slug, r.name, (SELECT COUNT(*) FROM news n WHERE ${LIVE} AND (n.region_slug = r.slug
        OR n.primary_country IN (SELECT country_code FROM news_region_countries WHERE region_slug = r.slug)
        OR n.id IN (SELECT news_id FROM news_article_countries WHERE country_code IN (SELECT country_code FROM news_region_countries WHERE region_slug = r.slug)))) AS c
      FROM news_regions r WHERE r.active = 1 ORDER BY r.display_order, r.name`),
    extra(`SELECT code, COUNT(DISTINCT id) AS c FROM (
        SELECT n.primary_country AS code, n.id FROM news n WHERE n.primary_country IS NOT NULL AND n.primary_country <> '' AND ${LIVE}
        UNION SELECT ac.country_code AS code, n.id FROM news_article_countries ac JOIN news n ON n.id = ac.news_id WHERE ${LIVE})
      GROUP BY code ORDER BY c DESC LIMIT ${NAV_MAX_COUNTRIES}`)
  ]);
  const own = new Map(counts.map((r) => [r.id, r.c]));
  const kids = (s) => secs.filter((k) => k.parent_id === s.id);
  const total = (s) => (own.get(s.id) || 0) + kids(s).reduce((n, k) => n + (own.get(k.id) || 0), 0);
  const ids = new Set(secs.map((s) => s.id));
  const sections = [];
  for (const s of secs.filter((k) => !k.parent_id || !ids.has(k.parent_id))) {
    if (!total(s)) continue;
    sections.push({ slug: s.slug, name: s.name, count: total(s) });
    for (const c of kids(s)) if (own.get(c.id)) sections.push({ slug: c.slug, name: c.name, count: own.get(c.id), child: true });
  }
  const topicList = topics.map((t) => ({ slug: t.slug, name: t.name, count: t.c }));
  // Inline chips: the busiest top-level sections and topics together (a name in both shows once, as the section).
  const seen = new Set();
  const popular = [
    ...sections.filter((s) => !s.child).map((s) => ({ kind: 'section', ...s })),
    ...topicList.map((t) => ({ kind: 'topic', ...t }))
  ].sort((x, y) => y.count - x.count || (x.kind === 'section' ? -1 : 1) || x.name.localeCompare(y.name))
    .filter((x) => { const k = x.name.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, NAV_POPULAR);
  const regions = regionRows.filter((r) => r.c > 0).map((r) => ({ slug: r.slug, name: r.name, count: r.c }));
  // Only PUBLISHED countries have a page; the canonical slug is the one that page lives at.
  const countries = [];
  for (const r of countryRows) {
    const c = await getCountryByCode(db, r.code).catch(() => null);
    if (c) countries.push({ slug: c.canonical, name: c.name, count: r.c });
  }
  countries.sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
  return { sections, topics: topicList, regions, countries, popular, dates };
}

// "Date & time" dropdown: quick ranges + calendar pickers. A plain GET form to the news page, so it works
// without JavaScript (then in UTC); the page script adds the reader's timezone offset (tzo) to the form and links.
const DATE_PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month']];
function renderDateDropdown() {
  const presets = DATE_PRESETS.map(([k, label]) => `<li><a data-nr-tz href="/en/news?range=${k}">${label}</a></li>`).join('');
  return `<details class="nr-nav__dd" name="nr-nav"><summary>Date &amp; time</summary><div class="nr-nav__panel nr-nav__panel--date">
<ul class="nr-date-presets" aria-label="Quick ranges">${presets}</ul>
<form class="nr-date-form" method="get" action="/en/news">
<label>On a day<input type="date" name="day"></label>
<div class="nr-date-row"><label>From<input type="date" name="from"></label><label>To<input type="date" name="to"></label></div>
<div class="nr-date-row"><label>Time from<input type="time" name="from_time"></label><label>Time to<input type="time" name="to_time"></label></div>
<input type="hidden" name="tzo" value="">
<p class="nr-date-note">Dates and times use your own timezone.</p>
<div class="nr-date-actions"><button type="submit">Show articles</button><a href="/en/news">Clear</a></div>
</form></div></details>`;
}

export function renderNewsNav(nav) {
  if (!nav) return '';
  const regions = nav.regions || [], countries = nav.countries || [];
  if (!nav.sections.length && !nav.topics.length && !regions.length && !countries.length && !nav.dates) return '';
  const href = (kind, slug) => kind === 'topic' ? `/en/news/topic/${encodeURIComponent(slug)}` : `/en/news/${encodeURIComponent(slug)}`;
  const panel = (kind, items) => `<ul class="nr-nav__panel">${items.map((i) => `<li${i.child ? ' class="nr-nav__child"' : ''}><a href="${href(kind, i.slug)}"><span>${esc(i.name)}</span><small>${i.count}</small></a></li>`).join('')}</ul>`;
  const dd = (label, kind, items) => items.length ? `<details class="nr-nav__dd" name="nr-nav"><summary>${label}</summary>${panel(kind, items)}</details>` : '';
  const chips = (nav.popular || []).map((p) => `<li><a href="${href(p.kind, p.slug)}" title="${esc(p.name)}">${esc(p.name)}</a></li>`).join('');
  return `<nav class="nr-nav" aria-label="News sections and topics"><div class="nr-nav__bar">${dd('Sections', 'section', nav.sections)}${dd('Topics', 'topic', nav.topics)}${dd('Regions', 'region', regions)}${dd('Countries', 'country', countries)}${nav.dates ? renderDateDropdown() : ''}</div>${chips ? `<ul class="nr-nav__trend" aria-label="Popular">${chips}</ul>` : ''}</nav>`;
}

// ── rendering ────────────────────────────────────────────────
const iso = (d) => { const t = Date.parse(String(d ?? '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(d)) ? '' : 'Z')); return Number.isNaN(t) ? null : new Date(t).toISOString(); };
const dimAttr = (w, h) => (Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 ? { w, h } : { w: 1200, h: 675 });

function renderLead(a, formatDate) {
  const img = a.featured_image_url || '';
  const { w, h } = dimAttr(a.featured_image_width, a.featured_image_height);
  const alt = a.featured_image_alt && !/^\d+$/.test(String(a.featured_image_alt).trim()) ? a.featured_image_alt : a.title;
  const date = a.published_at || a.created_at;
  const badges = collectBadges(a).map((b) => `<li class="nr-badge nr-badge--${esc(b.key.replace(/[^a-z0-9_-]/gi, ''))}">${esc(b.text)}</li>`).join('');
  return `<section class="nr-lead" aria-labelledby="nr-lead-h"><h2 id="nr-lead-h" class="nr-visually-hidden">Top story</h2>
<a class="nr-lead__link" href="/en/news/${encodeURIComponent(a.slug)}">
${img ? `<img src="${esc(img)}" alt="${esc(alt)}" width="${w}" height="${h}" fetchpriority="high" decoding="async">` : ''}
<div class="nr-lead__body">${badges ? `<ul class="nr-badges" aria-label="Article labels">${badges}</ul>` : ''}<h3>${esc(a.title)}</h3>${a.excerpt ? `<p>${esc(String(a.excerpt).replace(/<[^>]*>/g, '').slice(0, 240))}</p>` : ''}
<span class="nr-lead__meta">${a.author_name ? `By ${esc(a.author_name)}` : ''}${date ? `${a.author_name ? ' · ' : ''}${renderTime(date)}` : ''}</span></div></a></section>`;
}

function renderRanked(items, { heading, id, showViews = false, open = true, asDetails = false }) {
  if (!items.length) return '';
  const list = `<ol class="nr-ranked">${items.map((a) => `<li><a href="/en/news/${encodeURIComponent(a.slug)}">${esc(a.title)}</a></li>`).join('')}</ol>`;
  return asDetails
    ? `<details class="nr-ranked-group"${open ? ' open' : ''}><summary>${esc(heading)}</summary>${list}</details>`
    : `<section class="nr-side-block" aria-labelledby="${id}"><h2 id="${id}">${esc(heading)}</h2>${list}</section>`;
}

export function renderHomepage(d, formatDate = (x) => String(x)) {
  if (!d.lead && !d.latest.length) {
    return `<p class="nr-empty">No articles have been published yet. Please check back soon.</p>`;
  }
  const parts = [];
  if (d.lead) parts.push(renderLead(d.lead, formatDate));

  const mr = Object.entries(d.mostRead || {}).filter(([, items]) => items.length);
  const mostReadHtml = mr.length
    ? `<section class="nr-side-block" aria-labelledby="nr-mostread-h"><h2 id="nr-mostread-h">Most read</h2>${mr.map(([k, items], i) => renderRanked(items, { heading: MOST_READ_WINDOWS[k].label, asDetails: true, open: i === 0 })).join('')}</section>` : '';
  const trendingHtml = renderRanked(d.trending || [], { heading: 'Trending', id: 'nr-trending-h' });
  const side = trendingHtml + mostReadHtml;

  parts.push(`<div class="nr-home__main${side ? ' nr-home__main--split' : ''}">
${d.latest.length ? `<section class="nr-latest" aria-labelledby="nr-latest-h"><h2 id="nr-latest-h">Latest news</h2><div class="nr-grid">${d.latest.map((a) => renderArticleCard(a, formatDate)).join('')}</div></section>` : ''}
${side ? `<aside class="nr-side" aria-label="Most read and trending">${side}</aside>` : ''}</div>`);

  for (const s of d.sections || []) {
    parts.push(`<section class="nr-block" aria-labelledby="nr-sec-${s.id}"><h2 id="nr-sec-${s.id}"><a href="/en/news/${encodeURIComponent(s.slug)}">${esc(s.name)}</a></h2><div class="nr-grid nr-grid--4">${s.articles.map((a) => renderArticleCard(a, formatDate)).join('')}</div></section>`);
  }
  if ((d.analysis || []).length) {
    parts.push(`<section class="nr-block" aria-labelledby="nr-analysis-h"><h2 id="nr-analysis-h">Analysis &amp; research</h2><div class="nr-grid nr-grid--4">${d.analysis.map((a) => renderArticleCard(a, formatDate)).join('')}</div></section>`);
  }

  parts.push(`<section class="nr-block nr-newsletter" aria-labelledby="nr-news-h"><h2 id="nr-news-h">Get the news by email</h2>
<form class="newsletter-form" novalidate><div class="footer-newsletter-row"><input type="email" name="email" placeholder="Your email address" required aria-label="Email address"><button type="submit" class="btn btn--primary">Subscribe</button></div><p class="newsletter-message" style="display:none" role="status"></p></form></section>`);

  const live = new Map((d.trust || []).map((p) => [p.slug, p.title]));
  const links = TRUST_PAGES.filter((t) => t.slug !== 'editorial' && live.has(t.slug));
  if (links.length) {
    parts.push(`<nav class="nr-block nr-trust" aria-label="Editorial policies"><h2>How we work</h2><ul>${links.map((t) => `<li><a href="/en/${t.slug}">${esc(live.get(t.slug) || t.title)}</a></li>`).join('')}</ul></nav>`);
  }
  return `<div class="nr-home">${parts.join('\n')}</div>`;
}
