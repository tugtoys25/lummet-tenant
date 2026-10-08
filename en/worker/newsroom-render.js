// ============================================================
// en/worker/newsroom-render.js  --  Stage D: public newsroom HTML builders
//
// PURE functions: no DB, no env, no globals. Everything dynamic is escaped by
// esc(). IMPORTANT template-engine quirk (render.js replaceVariables): raw
// {{{vars}}} are inlined FIRST and the result is then scanned again for
// {{#if}} and {{vars}}. So esc() also entity-encodes "{" and "}" -- otherwise
// an editor typing "{{title}}" into a source description would be expanded
// by the template engine. Every string that reaches the page goes through esc().
//
// Nothing here names a tenant: publication name and any policy links arrive as
// parameters (from site context / settings).
// ============================================================

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  .replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');

// Only absolute http(s) URLs without credentials become links; anything else
// (javascript:, data:, relative, malformed) renders as plain text.
export function safeHref(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch { return null; }
}

// Only same-site absolute paths ("/en/...") are accepted as policy links.
export const safeLocalHref = (h) => typeof h === 'string' && /^\/[a-z0-9][a-z0-9\/_-]*$/i.test(h);

const pretty = (s) => String(s || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const isoOrNull = (d) => { const t = Date.parse(String(d ?? '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(d)) ? '' : 'Z')); return Number.isNaN(t) ? null : new Date(t).toISOString(); };

export const LABEL_TEXT = { breaking: 'Breaking', developing: 'Developing', exclusive: 'Exclusive', analysis: 'Analysis',
  investigation: 'Investigation', interview: 'Interview', opinion: 'Opinion', research: 'Research', press_release: 'Press release' };
const TYPE_BADGE = { analysis: 'Analysis', interview: 'Interview', investigation: 'Investigation', explainer: 'Explainer', research: 'Research',
  opinion: 'Opinion', original_reporting: 'Original reporting', press_release: 'Press release', feature: 'Feature', live: 'Live' };
const CLASS_BADGE = { sponsored: 'Sponsored', commercial: 'Commercial content', press_release: 'Press release' };
export const SOURCE_TYPE_TEXT = { official_statement: 'Official statement', regulator: 'Regulator', government: 'Government', court_document: 'Court document',
  company_filing: 'Company filing', press_release: 'Press release', interview: 'Interview', original_reporting: 'Original reporting',
  industry_report: 'Industry report', research: 'Research', other: 'Other' };
const RELATION_HEADING = { related: 'Related stories', previous_coverage: 'Previous coverage', follow_up: 'Follow-up', background: 'Background',
  explainer: 'Explainers', original_story: 'Original story' };
const RELATION_ORDER = Object.keys(RELATION_HEADING);

export function parseJson(s, fallback) { try { const v = s ? JSON.parse(s) : fallback; return v ?? fallback; } catch { return fallback; } }

// ── badges / kicker ─────────────────────────────────────────
export function collectBadges(article) {
  const out = [];
  const add = (key, text) => { if (text && !out.some((b) => b.text === text)) out.push({ key, text }); };
  add('class-' + article.content_class, CLASS_BADGE[article.content_class]);      // commercial state first: never hidden
  for (const l of parseJson(article.labels, [])) add('label-' + l, LABEL_TEXT[l]);
  add('type-' + article.article_type, TYPE_BADGE[article.article_type]);
  return out;
}

export function renderKicker({ article, section }) {
  const badges = collectBadges(article);
  if (!badges.length && !section) return '';
  const badgeHtml = badges.length
    ? `<ul class="nr-badges" aria-label="Article labels">${badges.map((b) => `<li class="nr-badge nr-badge--${esc(b.key.replace(/[^a-z0-9_-]/gi, ''))}">${esc(b.text)}</li>`).join('')}</ul>` : '';
  const sectionHtml = section
    ? `<a class="nr-section" href="/en/news/${encodeURIComponent(section.slug)}">${esc(section.name)}</a>` : '';
  return `<div class="nr-kicker">${sectionHtml}${badgeHtml}</div>`;
}

// ── notices: type / commercial / press release ───────────────
export function renderTypeNotices({ article, siteName }) {
  const n = [];
  const site = esc(siteName || 'this publication');
  if (article.content_class === 'sponsored') {
    n.push(`<p class="nr-notice nr-notice--sponsored" role="note"><strong>Sponsored content.</strong> This article was produced in connection with a commercial arrangement and does not represent the independent editorial view of ${site}.</p>`);
  } else if (article.content_class === 'commercial') {
    n.push(`<p class="nr-notice nr-notice--commercial" role="note"><strong>Commercial content.</strong> This page may involve commercial or affiliate relationships.</p>`);
  }
  if (article.article_type === 'press_release' || article.content_class === 'press_release') {
    const by = article.pr_provided_by ? ` by ${esc(article.pr_provided_by)}` : '';
    const href = safeHref(article.pr_original_source_url);
    const date = article.pr_original_date ? ` Originally published ${esc(article.pr_original_date)}.` : '';
    const src = href ? ` <a href="${esc(href)}" rel="noopener noreferrer">Original source</a>.` : '';
    n.push(`<p class="nr-notice nr-notice--press-release" role="note"><strong>Press release.</strong> This content was provided${by} and has not been independently reported by ${site}.${date}${src}</p>`);
  }
  if (article.article_type === 'opinion') {
    n.push(`<p class="nr-notice nr-notice--opinion" role="note"><strong>Opinion.</strong> This article reflects the views of its author and is not a news report.</p>`);
  } else if (article.article_type === 'analysis') {
    n.push(`<p class="nr-notice nr-notice--analysis" role="note"><strong>Analysis.</strong> This article interprets developments and includes the author's assessment.</p>`);
  }
  return n.join('');
}

// ── corrections / clarifications / updates / retractions ─────
export function renderCorrections(list, formatDate = (d) => String(d), policyHref = null) {
  if (!Array.isArray(list) || !list.length) return '';
  const items = list.map((c) => {
    const type = ['correction', 'clarification', 'update', 'retraction'].includes(c.type) ? c.type : 'update';
    const iso = isoOrNull(c.created_at);
    const when = iso ? `<time datetime="${esc(iso)}">${esc(formatDate(c.created_at))}</time>` : '';
    return `<div class="nr-correction nr-correction--${type}" role="note"><p class="nr-correction__title"><strong>${esc(pretty(type))}</strong>${when ? ' — ' + when : ''}</p><p>${esc(c.public_message)}</p></div>`;
  }).join('');
  const policy = safeLocalHref(policyHref) ? `<p class="nr-policy"><a href="${esc(policyHref)}">Corrections policy</a></p>` : '';
  return `<aside class="nr-corrections" aria-label="Corrections and updates">${items}${policy}</aside>`;
}

// ── sources / methodology ────────────────────────────────────
export function renderSources(list, formatDate = (d) => String(d), policyHref = null) {
  if (!Array.isArray(list) || !list.length) return '';
  const li = list.map((s) => {
    const href = safeHref(s.source_url);
    const name = href ? `<a href="${esc(href)}" rel="noopener noreferrer">${esc(s.source_name)}</a>` : esc(s.source_name);
    const meta = [SOURCE_TYPE_TEXT[s.source_type] && s.source_type !== 'other' ? esc(SOURCE_TYPE_TEXT[s.source_type]) : '',
      s.source_date ? esc(s.source_date) : '', s.author ? 'by ' + esc(s.author) : ''].filter(Boolean).join(' · ');
    return `<li>${name}${meta ? ` <span class="nr-source__meta">(${meta})</span>` : ''}${s.description ? `<br><span class="nr-source__desc">${esc(s.description)}</span>` : ''}</li>`;
  }).join('');
  const policy = safeLocalHref(policyHref) ? `<p class="nr-policy"><a href="${esc(policyHref)}">How we use sources</a></p>` : '';
  return `<section class="nr-sources" aria-labelledby="nr-sources-h"><h2 id="nr-sources-h">Sources</h2><ol>${li}</ol>${policy}</section>`;
}

export function renderMethodology(text) {
  const t = String(text ?? '').trim();
  if (!t) return '';
  const paras = t.split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  return `<section class="nr-method" aria-labelledby="nr-method-h"><h2 id="nr-method-h">Reporting &amp; Methodology</h2>${paras}</section>`;
}

// ── contextual disclosures (per-article opt-in; texts overridable) ──
export const DEFAULT_DISCLOSURES = (siteName) => ({
  editorial_independence: 'Editorial content is produced independently of commercial relationships.',
  affiliate: `${siteName} may earn a commission if you register with or purchase from a linked third party. This does not influence our reporting.`,
  sponsored: 'This content is sponsored and labelled as such.',
  advertising: 'This page may display advertising.',
  ai_assistance: 'Artificial intelligence tools were used in preparing this article.'
});

export function renderDisclosures({ flags, article, siteName, texts = {}, links = {} }) {
  const merged = { ...DEFAULT_DISCLOSURES(siteName || 'This publication'), ...texts };
  const on = Object.keys(DEFAULT_DISCLOSURES('')).filter((k) => flags && flags[k] === true && k !== 'sponsored');
  if (article.content_class === 'sponsored' || article.content_class === 'commercial') on.unshift('sponsored');
  const uniq = [...new Set(on)];
  if (!uniq.length) return '';
  const items = uniq.map((k) => {
    const href = safeLocalHref(links[k]) ? links[k] : safeHref(links[k]);
    return `<li>${esc(merged[k])}${href ? ` <a href="${esc(href)}">Learn more</a>` : ''}</li>`;
  }).join('');
  return `<aside class="nr-disclosures" aria-label="Disclosures"><ul>${items}</ul></aside>`;
}

// ── live timeline ────────────────────────────────────────────
export function renderTimeline(items, formatDate = (d) => String(d)) {
  if (!Array.isArray(items) || !items.length) return '';
  const li = items.map((t) => {
    const iso = isoOrNull(t.update_time);
    return `<li><time${iso ? ` datetime="${esc(iso)}"` : ''}>${esc(formatDate(t.update_time))}</time><p>${esc(t.body)}</p>${t.editor_name ? `<span class="nr-timeline__by">${esc(t.editor_name)}</span>` : ''}</li>`;
  }).join('');
  return `<section class="nr-timeline" aria-labelledby="nr-timeline-h"><h2 id="nr-timeline-h">Live updates</h2><ol>${li}</ol></section>`;
}

// ── editorially selected related stories ─────────────────────
export function renderEditorialRelated(list) {
  if (!Array.isArray(list) || !list.length) return '';
  const groups = new Map();
  for (const r of list) { const k = RELATION_HEADING[r.relation_type] ? r.relation_type : 'related'; (groups.get(k) || groups.set(k, []).get(k)).push(r); }
  const html = RELATION_ORDER.filter((k) => groups.has(k)).map((k) =>
    `<h3>${esc(RELATION_HEADING[k])}</h3><ul>${groups.get(k).map((r) => `<li><a href="/en/news/${encodeURIComponent(r.slug)}">${esc(r.title)}</a></li>`).join('')}</ul>`).join('');
  return `<section class="nr-related" aria-labelledby="nr-related-h"><h2 id="nr-related-h">Related coverage</h2>${html}</section>`;
}

// ── assemble everything for one article page ─────────────────
// `flags` = { news_new_taxonomy, news_sources_display, news_corrections_display }
// `extras` = result of loadPublicNewsroom (any part may be missing/empty).
export function buildNewsroomBlocks({ article, extras, flags, siteName, formatDate, disclosureTexts, policyLinks }) {
  const empty = { kicker_html: '', notice_html: '', timeline_html: '', after_html: '', discovery_html: '', related_html: '', schema: {} };
  if (!extras) return empty;
  const tax = !!flags.news_new_taxonomy, src = !!flags.news_sources_display, corr = !!flags.news_corrections_display;
  const section = tax ? extras.section : null;

  const kicker = tax ? renderKicker({ article, section }) : '';
  const corrections = corr ? renderCorrections(extras.corrections, formatDate, policyLinks?.corrections) : '';
  const notices = tax ? renderTypeNotices({ article, siteName }) : '';
  const timeline = tax ? renderTimeline(extras.timeline, formatDate) : '';
  const sources = src ? renderSources(extras.sources, formatDate, policyLinks?.methodology) : '';
  const method = src ? renderMethodology(article.methodology) : '';
  const disclosures = tax ? renderDisclosures({ flags: parseJson(article.disclosure_json, {}), article, siteName, texts: disclosureTexts, links: policyLinks }) : '';
  const seriesNav = tax ? renderSeriesNav(extras.discovery?.series) : '';
  const discovery = tax ? renderDiscovery(extras.discovery) : '';
  const more = tax ? renderMoreFromSection(extras.discovery?.more, section) : '';
  const related = seriesNav + (tax ? renderEditorialRelated(extras.related) : '') + more;

  const after = sources + method + disclosures;
  const notice_html = corrections + notices;
  const anything = kicker || notice_html || timeline || after || related || discovery;
  const css = anything ? '<link rel="stylesheet" href="/static/css/newsroom.css">' : '';

  const schema = {};
  if (src && Array.isArray(extras.sources)) {
    const cites = extras.sources.map((s) => ({ s, href: safeHref(s.source_url) })).filter((x) => x.href)
      .map(({ s, href }) => ({ '@type': 'CreativeWork', name: s.source_name, url: href }));
    if (cites.length) schema.citation = cites;
  }
  if (corr && Array.isArray(extras.corrections) && extras.corrections.length) {
    schema.correction = extras.corrections.map((c) => ({ '@type': 'CorrectionComment', text: c.public_message, ...(isoOrNull(c.created_at) ? { datePublished: isoOrNull(c.created_at) } : {}) }));
  }
  if (section?.name) schema.articleSection = section.name;

  return { kicker_html: css + kicker, notice_html, timeline_html: timeline, after_html: after, discovery_html: discovery, related_html: related, schema };
}

// ── section page pieces ──────────────────────────────────────
export function renderArticleCard(a, formatDate = (d) => String(d)) {
  const img = a.featured_image_url || a.featured_image_thumbnail || '';
  const alt = (a.featured_image_alt && !/^\d+$/.test(String(a.featured_image_alt).trim())) ? a.featured_image_alt : a.title;
  const date = a.published_at || a.created_at;
  const iso = isoOrNull(date);
  const badges = collectBadges(a).slice(0, 2).map((b) => `<span class="nr-badge nr-badge--${esc(b.key.replace(/[^a-z0-9_-]/gi, ''))}">${esc(b.text)}</span>`).join('');
  return `<article class="nr-card">
<a href="/en/news/${encodeURIComponent(a.slug)}" class="nr-card__link">
${img ? `<img src="${esc(img)}" alt="${esc(alt)}" loading="lazy" decoding="async" width="640" height="360">` : ''}
<div class="nr-card__body">${badges ? `<div class="nr-badges-inline">${badges}</div>` : ''}<h3>${esc(a.title)}</h3>${a.excerpt ? `<p>${esc(String(a.excerpt).replace(/<[^>]*>/g, '').slice(0, 180))}</p>` : ''}${date ? `<time${iso ? ` datetime="${esc(iso)}"` : ''}>${esc(formatDate(date))}</time>` : ''}</div>
</a></article>`;
}

export function renderPagination(basePath, page, totalPages, extraQuery = '') {
  if (totalPages <= 1) return '';
  const href = (p) => (p === 1 ? (extraQuery ? `${basePath}?${extraQuery}` : basePath) : `${basePath}?${extraQuery ? extraQuery + '&' : ''}page=${p}`);
  const prev = page > 1 ? `<a rel="prev" href="${esc(href(page - 1))}">Previous</a>` : '';
  const next = page < totalPages ? `<a rel="next" href="${esc(href(page + 1))}">Next</a>` : '';
  return `<nav class="nr-pagination" aria-label="Pagination">${prev}<span aria-current="page">Page ${page} of ${totalPages}</span>${next}</nav>`;
}

// ── public JSON allow-list (fixes the n.* leak on public endpoints) ──
// Allow-list, not deny-list: a column added to `news` in future is private
// until someone deliberately adds it here. `content` stays for compatibility
// (app.js / news_feed.html use it as an excerpt fallback).
export const PUBLIC_NEWS_FIELDS = ['id', 'slug', 'title', 'content', 'author', 'author_id', 'seo_title', 'seo_description', 'seo_keywords',
  'published', 'published_at', 'featured_image', 'og_image', 'excerpt', 'tags', 'created_at', 'updated_at', 'ai_generated',
  'featured_image_url', 'featured_image_thumbnail', 'featured_image_alt', 'author_name', 'author_slug', 'author_avatar', 'author_role',
  'article_type', 'section_id', 'primary_country', 'region_slug', 'content_class', 'labels'];

export function sanitizePublicNewsRow(row) {
  const out = {};
  for (const k of PUBLIC_NEWS_FIELDS) if (k in row) out[k] = row[k];
  return out;
}
export const sanitizePublicNewsList = (rows) => (Array.isArray(rows) ? rows.map(sanitizePublicNewsRow) : []);

// ── entity pages ─────────────────────────────────────────────
const ENTITY_TYPE_TEXT = { company: 'Company', operator: 'Operator', regulator: 'Regulator', person: 'Person', organization: 'Organisation' };
export function renderEntityAbout(e) {
  const href = safeHref(e.website_url);
  const bits = [ENTITY_TYPE_TEXT[e.entity_type] ? esc(ENTITY_TYPE_TEXT[e.entity_type]) : '', e.country_name ? esc(e.country_name) : ''].filter(Boolean).join(' · ');
  const logo = e.logo_url ? `<img class="nr-entity__logo" src="${esc(e.logo_url)}" alt="${esc(e.name)} logo" width="96" height="96" loading="lazy" decoding="async">` : '';
  const site = href ? `<p><a href="${esc(href)}" rel="noopener noreferrer nofollow">Official website</a></p>` : '';
  if (!logo && !bits && !site) return '';
  return `<section class="nr-entity" aria-label="About ${esc(e.name)}">${logo}<div>${bits ? `<p class="nr-entity__meta">${bits}</p>` : ''}${site}</div></section>`;
}
export function entitySchema(e) {
  const type = e.entity_type === 'person' ? 'Person' : e.entity_type === 'regulator' ? 'GovernmentOrganization' : 'Organization';
  const href = safeHref(e.website_url);
  return { '@type': type, name: e.name, ...(e.description ? { description: e.description } : {}), ...(href ? { url: href, sameAs: [href] } : {}), ...(e.logo_url && type !== 'Person' ? { logo: e.logo_url } : {}) };
}

// ── discovery (Phase 44): a few useful editorial links, never a link farm ──
export function renderDiscovery(d) {
  if (!d) return '';
  const link = (href, text) => `<a href="${esc(href)}">${esc(text)}</a>`;
  const groups = [
    ['Region and countries', [...(d.region ? [link(`/en/news/${encodeURIComponent(d.region.slug)}`, d.region.name)] : []), ...(d.countries || []).map((c) => link(`/en/news/${encodeURIComponent(c.slug)}`, c.name))]],
    ['Topics', (d.topics || []).map((t) => link(`/en/news/topic/${encodeURIComponent(t.slug)}`, t.name))],
    ['Companies and people', (d.entities || []).map((e) => link(`/en/news/entity/${encodeURIComponent(e.slug)}`, e.name))]
  ].filter(([, items]) => items.length);
  if (!groups.length) return '';
  return `<nav class="nr-discovery" aria-label="Explore related coverage"><ul>${groups.map(([label, items]) => `<li><span class="nr-discovery__label">${esc(label)}:</span> ${items.join(' · ')}</li>`).join('')}</ul></nav>`;
}

// "Part N of <series>" with previous / next article (live articles only).
export function renderSeriesNav(s) {
  if (!s) return '';
  const nav = (n, dir) => n ? `<li><span class="nr-series-nav__dir">${dir}</span> <a href="/en/news/${encodeURIComponent(n.slug)}" rel="${dir === 'Previous' ? 'prev' : 'next'}">${esc(n.title)}</a></li>` : '';
  const part = s.part ? `Part ${s.part} of ${s.total}` : `${s.total} parts`;
  return `<aside class="nr-series-nav" aria-label="Series"><p><strong>${esc(part)}</strong> in the series <a href="/en/news/series/${encodeURIComponent(s.slug)}">${esc(s.name)}</a></p>${s.prev || s.next ? `<ul>${nav(s.prev, 'Previous')}${nav(s.next, 'Next')}</ul>` : ''}</aside>`;
}

export function renderMoreFromSection(items, section) {
  if (!Array.isArray(items) || !items.length || !section) return '';
  return `<section class="nr-more" aria-labelledby="nr-more-h"><h2 id="nr-more-h">More from <a href="/en/news/${encodeURIComponent(section.slug)}">${esc(section.name)}</a></h2><ul>${items.map((i) => `<li><a href="/en/news/${encodeURIComponent(i.slug)}">${esc(i.title)}</a></li>`).join('')}</ul></section>`;
}

// ── author profile (Phase 12) ────────────────────────────────
export function renderAuthorFacts(author, articleCount) {
  const rows = [];
  const add = (dt, dd) => { if (dd) rows.push(`<div><dt>${esc(dt)}</dt><dd>${dd}</dd></div>`); };
  add('Role', author.job_title ? esc(author.job_title) : '');
  add('Expertise', author.expertise ? esc(author.expertise) : '');
  add('Based in', author.location ? esc(author.location) : '');
  const href = safeHref(author.website_url);
  add('Website', href ? `<a href="${esc(href)}" rel="me noopener noreferrer">${esc(new URL(href).hostname)}</a>` : '');
  if (Number.isInteger(articleCount)) add('Articles', String(articleCount));
  return rows.length ? `<dl class="nr-author-facts">${rows.join('')}</dl>` : '';
}

export function authorPersonSchema({ author, canonical, siteName, origin, articleCount }) {
  const href = safeHref(author.website_url);
  return {
    '@context': 'https://schema.org', '@type': 'Person', '@id': `${canonical}#person`, url: canonical, name: author.name,
    ...(author.bio ? { description: author.bio } : {}),
    ...(author.avatar_url ? { image: author.avatar_url } : {}),
    jobTitle: author.job_title || author.role || 'Editor',
    ...(author.expertise ? { knowsAbout: String(author.expertise).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12) } : {}),
    ...(author.location ? { workLocation: { '@type': 'Place', name: author.location } } : {}),
    ...(href ? { sameAs: [href] } : {}),
    worksFor: { '@type': 'NewsMediaOrganization', name: siteName, url: origin }
  };
}

// ── search form (GET, works without JavaScript) ──────────────
const TYPE_LABELS = { news: 'News', analysis: 'Analysis', interview: 'Interview', investigation: 'Investigation', explainer: 'Explainer', research: 'Research', opinion: 'Opinion', original_reporting: 'Original reporting', press_release: 'Press release', feature: 'Feature', live: 'Live / developing' };
export function renderSearchForm({ params, facets, action = '/en/news' }) {
  const opt = (value, text, selected) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(text)}</option>`;
  const select = (id, name, label, items, current) => items && items.length
    ? `<div class="nr-field"><label for="${id}">${esc(label)}</label><select id="${id}" name="${name}"><option value="">Any</option>${items.map(([v, t]) => opt(v, t, v === current)).join('')}</select></div>` : '';
  const date = (id, name, label, v) => `<div class="nr-field"><label for="${id}">${esc(label)}</label><input id="${id}" type="date" name="${name}" value="${esc(/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '')}"></div>`;
  return `<form class="nr-search" method="get" action="${esc(action)}" role="search">
<div class="nr-search__main"><label for="nr-q" class="nr-visually-hidden">Search news</label><input id="nr-q" type="search" name="q" value="${esc(params.q || '')}" placeholder="Search news articles..." maxlength="200"><button type="submit" class="btn btn--primary">Search</button></div>
<details class="nr-search__filters"${params.section || params.author || params.country || params.entity || params.type || params.from || params.to ? ' open' : ''}><summary>Filters</summary><div class="nr-search__grid">
${select('nr-f-section', 'section', 'Section', (facets.sections || []).map((s) => [s.slug, s.name]), params.section)}
${select('nr-f-type', 'type', 'Article type', (facets.types || []).map((t) => [t, TYPE_LABELS[t] || t]), params.type)}
${select('nr-f-author', 'author', 'Author', (facets.authors || []).map((a) => [a.slug, a.name]), params.author)}
${select('nr-f-country', 'country', 'Country', (facets.countries || []).map((c) => [c.slug, c.name]), params.country)}
${select('nr-f-entity', 'entity', 'Company or person', (facets.entities || []).map((e) => [e.slug, e.name]), params.entity)}
${date('nr-f-from', 'from', 'From', params.from)}${date('nr-f-to', 'to', 'To', params.to)}
</div></details></form>`;
}
