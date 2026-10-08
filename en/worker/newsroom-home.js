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

import { esc, collectBadges, renderArticleCard } from './newsroom-render.js';
import { CARD_COLUMNS, getMostRead, getPinned, getTrending, MOST_READ_WINDOWS } from './newsroom-stats.js';
import { getPublishedTrustPages, TRUST_PAGES } from './newsroom-trust.js';

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
  return {
    lead, latest,
    sections: [...bySection.values()].slice(0, MAX_SECTION_BLOCKS),
    analysis: analysis.filter((a) => a.id !== lead?.id),
    mostRead: Object.fromEntries(mostRead),
    trending, trust
  };
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
<span class="nr-lead__meta">${a.author_name ? `By ${esc(a.author_name)}` : ''}${date ? `${a.author_name ? ' · ' : ''}<time${iso(date) ? ` datetime="${esc(iso(date))}"` : ''}>${esc(formatDate(date))}</time>` : ''}</span></div></a></section>`;
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
