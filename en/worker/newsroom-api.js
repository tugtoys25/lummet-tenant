// ============================================================
// en/worker/newsroom-api.js  --  Stage C: newsroom admin API + save hooks
//
// Mounted from api.js AFTER authentication, so `user` is always a real
// session user. Every endpoint additionally:
//   * requires application/json + same-origin for writes (defence in depth
//     on top of SameSite=Lax session cookies)
//   * checks a specific news.<action> permission (checkPermission)
//   * applies item-level access (canAccessItem) for per-article endpoints;
//     an inaccessible article answers 404, same as the existing news API
//   * uses only bound parameters; never returns internal columns to callers
//     that lack news.read
//
// The coarse write gate in api.js (prefix /api/v1/news -> resource "news")
// also covers these paths, as an extra layer.
//
// Feature flags: workflow endpoints require `news_editorial_workflow`.
// Data-entry endpoints (taxonomy, meta, sources, corrections) are always
// available to authorised users: they only write additive tables and change
// nothing public until the public-rendering flags are switched on.
// ============================================================

import * as permDB from './database/permissions.js';
import * as itemAccess from './database/item-access.js';
import { logAudit } from './database/audit.js';
import { invalidateNews } from './cache.js';
import * as nr from './database/newsroom.js';
import { resetNewsFlagCache } from './database/newsroom.js';
import * as tx from './database/newsroom-taxonomy.js';
import * as trust from './newsroom-trust.js';
import * as stats from './newsroom-stats.js';
import * as analytics from './newsroom-analytics.js';
import * as search from './newsroom-search.js';
import * as pro from './newsroom-pro.js';
import * as audience from './newsroom-audience.js';
import * as ops from './newsroom-ops.js';
import * as comments from './newsroom-comments.js';
import * as push from './newsroom-push.js';
import * as membership from './newsroom-membership.js';
import * as nimport from './newsroom-import.js';
import * as media from './newsroom-media.js';
import * as safety from './newsroom-safety.js';
import * as cal from './newsroom-calendar.js';
import * as planner from './newsroom-planner.js';
import * as commerce from './newsroom-commerce.js';
import * as nlinks from './newsroom-links.js';

export const NEWSROOM_ROLES = ['Reporter', 'Senior Reporter', 'Editor', 'Senior Editor', 'Managing Editor',
  'Researcher', 'Data Editor', 'Correspondent', 'Contributor'];

// ── Feature flags (system_settings, key LIKE 'news_%') ────────
// Descriptions shown in the admin UI. A flag not listed here still shows up
// (labelled with its raw key) if it exists in the database -- this list is
// documentation, not an allow-list for reads. Writes ARE allow-listed below.
const FLAG_INFO = {
  news_editorial_workflow: { label: 'Editorial workflow', help: 'Draft -> review -> fact-check -> approve -> publish, with revision history. Off: legacy simple publishing.' },
  news_new_taxonomy: { label: 'Sections, regions, countries & topics', help: 'Section/region/country/topic/series pages, article badges & notices, discovery links. Needs sections/topics set up first.' },
  news_sources_display: { label: 'Public sources & methodology', help: 'Shows the Sources list and Reporting & Methodology on published articles.' },
  news_corrections_display: { label: 'Public corrections banner', help: 'Shows corrections, clarifications, updates and retractions on articles.' },
  news_entity_pages: { label: 'Entity pages', help: '/en/news/entity/<slug> pages and company/person chips on articles.' },
  news_v2_homepage: { label: 'News homepage v2', help: 'Replaces /en/news with the lead story, latest, most read, trending and section blocks.' },
  news_trending: { label: 'Trending block', help: 'Needs page-view data; shows a trending list on the homepage and in Most Read.' },
  news_analytics_enrichment: { label: 'Analytics enrichment', help: 'Records a bot flag, device type and UTM parameters on news page views from the moment this is turned on (not retroactive).' },
  news_google_sitemap: { label: 'Google News sitemap', help: 'Publishes /en/news-sitemap.xml. Only useful once the publication is accepted in Google Publisher Center.' },
  news_rss_feeds: { label: 'RSS feeds', help: 'Publishes feeds at /en/news/feed.xml, for each section (/en/news/<section>/feed.xml), topic, entity, series and author, and adds the feed link to the news page. Off by default.' },
  news_rss_full_text: { label: 'Full article text in RSS feeds', help: 'Off: each feed item carries the summary only (readers click through). On: the whole article is included.' },
  news_share_bar: { label: 'Share buttons on articles', help: 'Adds a share bar (share, copy link, email, WhatsApp, X, Facebook, LinkedIn) under each article. No tracking and no third-party scripts.' },
  news_trust_footer_links: { label: 'Trust pages in the footer', help: 'Links your published policy pages (editorial, corrections, ethics, ownership and so on) from the footer of every page.' },
  news_copyright_reports: { label: 'Copyright and takedown form', help: 'Adds a "Report a copyright issue" page and link, and a queue in the Newsroom for handling reports.' },
  news_lazy_images: { label: 'Lazy-load article images', help: 'Adds loading="lazy" and decoding="async" to images inside article text so pages load faster. Off by default.' },
  news_web_vitals: { label: 'Core Web Vitals reporting', help: 'Collects real-reader speed measurements (LCP, CLS, INP, FCP, TTFB) on articles and the news page as daily counts. No IP addresses or visitor ids. See the Operations tab.' },
  news_section_digests: { label: 'Section email digests', help: 'Lets confirmed subscribers choose sections and daily or weekly emails at /en/newsletter/sections?token=... (the link is added to each digest). Needs the weekly e-mail sending already working.' },
  news_csv_export: { label: 'CSV export of articles', help: 'Adds an article list download (CSV) to the Operations tab for editors.' },
  news_section_ads: { label: 'Per-section ad slots', help: 'Ad rules that name sections (Settings > Ad rules) then show only on articles in those sections. Rules without sections are unchanged.' },
  news_comments: { label: 'Reader comments', help: 'Shows a comments list and form under each article. By default every comment waits for an editor (Newsroom > Comments). Plain text only; spam checks and rate limits included.' },
  news_comments_open_posting: { label: 'Publish comments without review', help: 'Off (recommended): every comment is held for approval. On: comments appear at once; ones that look like spam are still held. Only matters when Reader comments is on.' },
  news_web_push: { label: 'Web push notifications', help: 'Readers can opt in to browser notifications from an article; editors announce a story from Newsroom > Push. Set up the push keys there first. Works in browsers that support Web Push.' },
  news_push_auto: { label: 'Announce new stories automatically', help: 'Also sends a notification for each story that goes live (at most 3 a day). Only matters when Web push is on.' },
  news_membership: { label: 'Membership and member-only articles', help: 'Lets you mark articles as registered-only or members-only (Newsroom > Membership). Others see the first paragraphs and a sign-in box. Set up membership there first. Off: every article is free.' },
  news_backups: { label: 'Content backups', help: 'Saves your articles, authors, sections and redirects once a day (and on demand) to private storage, keeping the last 14. Download them from Newsroom > Safety. Restoring is done with support, not automatically.' },
  news_monitoring: { label: 'Uptime and error alerts', help: 'Checks the database and home page on every scheduled run, logs server errors, and emails you when the site goes down, recovers, or errors spike. Also opens /en/api/v1/health for an outside monitor.' },
  news_video_embeds: { label: 'Video embeds', help: 'A paragraph that holds only a YouTube link becomes a click-to-play player. Nothing loads from YouTube until the reader presses play.' },
  news_podcast: { label: 'Podcast feed', help: 'Publishes /en/podcast.xml from articles carrying your podcast tag and an audio player. Configure it in Newsroom > Media.' },
  news_galleries: { label: 'Photo galleries', help: 'Images inside a gallery block get a grid layout and a full-screen viewer.' },
  news_import: { label: 'Content import (WordPress, RSS, CSV)', help: 'Adds Newsroom > Import. Imported articles are always created as drafts for you to review. Existing addresses are never overwritten.' },
  news_indexnow: { label: 'Tell search engines about new articles (IndexNow)', help: 'Sends the address of each newly published or corrected article to Bing, Yandex and other IndexNow search engines. Off by default. Google does not use IndexNow; keep the Google News sitemap on for Google.' },
  news_revision_history: { label: 'Keep a revision for every edit', help: 'Records each edit of an article (even with the editorial workflow off) so earlier versions can be compared and restored from the Article tab.' },
  news_commerce: { label: 'Commerce: affiliate, listing and blog articles (master)', help: 'Master switch for affiliate and marketplace offers (Amazon, Alibaba and others), the mobile buy bar, photo gallery and enquiry forms, plus your own /en/go/<code> links. An article only changes when you set its type in Newsroom > Commerce. Off: every article is exactly as before, and your news links stop redirecting.' },
  news_commerce_widgets: { label: 'Commerce widgets', help: 'Buy / product / price / call-to-action widgets after the first and last paragraph and in columns below the text. Buttons use your affiliate links (/en/go/<your code>) so clicks are counted.' },
  news_commerce_sticky_bar: { label: 'Mobile sticky buy bar', help: 'A fixed Buy now (or Enquire) bar on phones, matches the other mobile sticky buttons on the site. Hides while a widget is on screen.' },
  news_reading_time: { label: 'Reading time', help: 'Shows "N min read" on articles.' },
  news_card_sections: { label: 'Section on cards', help: 'Shows the section name above the headline on news cards.' },
  news_menu_everywhere: { label: 'Menu on every news page', help: 'Shows the Sections / Topics / Regions / Countries / Date menu on section, region, country and article pages too (needs the taxonomy or search v2 switch).' },
  news_commerce_gallery: { label: 'Article photo gallery', help: 'Shows the photos picked under Newsroom > Commerce as a grid with the full-screen viewer.' },
  news_commerce_inquiry: { label: 'Inquiry forms (for-sale content)', help: 'Lets inquiry widgets show a form. Messages are stored and listed under Newsroom > Commerce. Needs the consent box ticked by the visitor.' },
  news_search_v2: { label: 'News search v2', help: 'Replaces /en/news?q= search. Rebuild the search index (Search tab) before turning this on.' },
};

const QUEUE_VIEWS = ['drafts', 'assigned_to_me', 'review', 'factcheck', 'approved', 'scheduled', 'published', 'corrections'];
const MAX_BODY = 512 * 1024;

const respond = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const ok = (data = {}) => respond({ success: true, ...data });
const fail = (error, status = 400) => respond({ success: false, error }, status);
const fromResult = (r, extra = {}) => (r.ok ? ok({ ...extra, ...(r.id !== undefined ? { id: r.id } : {}), ...(r.changed ? { changed: r.changed } : {}) }) : fail(r.error, r.status || 400));

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser / same-origin navigations omit it
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

async function readJson(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.toLowerCase().includes('application/json')) return { error: fail('Content-Type must be application/json', 415) };
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) return { error: fail('Request too large', 413) };
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: fail('Request too large', 413) };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: fail('Invalid JSON body') };
    return { body };
  } catch { return { error: fail('Invalid JSON') }; }
}

// Load one article the caller may access for `action` (read|update), else null.
async function accessibleArticle(env, user, id, action) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const item = await itemAccess.getItemById(env.DB, 'news', n);
  if (!item) return null;
  return (await itemAccess.canAccessItem(env.DB, user, 'news', action, item)) ? item : null;
}

// ── Main dispatcher ──────────────────────────────────────────
export async function handleNewsroomApi(request, env, user) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/en(?=\/)/, '');    // normalize, same as routes.js
  if (!path.startsWith('/api/v1/newsroom/')) return null;
  if (!user) return fail('Unauthorized', 401);

  const route = path.slice('/api/v1/newsroom/'.length);
  const isWrite = request.method === 'POST';
  if (request.method !== 'GET' && !isWrite) return fail('Method not allowed', 405);
  if (isWrite && !sameOrigin(request)) return fail('Cross-origin request refused', 403);

  const perms = await permDB.getPermissionsForUser(env.DB, user);
  const can = (a) => permDB.checkPermission(perms, 'news', a);
  const actor = { user_id: user.user_id };

  try {
    // ---------- reads ----------
    if (!isWrite) {
      if (!can('read')) return fail('Forbidden', 403);

      if (route === 'article') {
        const item = await accessibleArticle(env, user, url.searchParams.get('id'), 'read');
        if (!item) return fail('News article not found', 404);
        return ok(await loadBundle(env.DB, item.id, perms));
      }
      if (route === 'revisions') {
        const item = await accessibleArticle(env, user, url.searchParams.get('id'), 'read');
        if (!item) return fail('News article not found', 404);
        return ok({ revisions: await nr.listRevisions(env.DB, item.id, perms) });
      }
      if (route === 'revision/diff') {
        const item = await accessibleArticle(env, user, url.searchParams.get('id'), 'read');
        if (!item) return fail('News article not found', 404);
        const d = await pro.diffForRevision(env.DB, item.id, Number(url.searchParams.get('v')), perms);
        return d ? ok({ diff: d }) : fail('Revision not found', 404);
      }
      if (route === 'calendar') {
        const access = await itemAccess.getAccessibleWhereClause(env.DB, user, 'news', 'read', 'n');
        const calendar = await pro.loadCalendar(env.DB, { from: url.searchParams.get('from'), days: url.searchParams.get('days'), condition: access.condition, params: access.params, tzo: url.searchParams.get('tzo'), sectionId: url.searchParams.get('section'), authorId: url.searchParams.get('author') });
        const offMin = Math.max(-840, Math.min(840, Math.trunc(Number(url.searchParams.get('tzo'))) || 0));
        const fromMs = Date.parse(`${calendar.from}T00:00:00Z`) - offMin * 60000;
        const planned = await planner.listPlanned(env.DB, { fromMs, toMs: fromMs + calendar.days * 86400e3, condition: access.condition, params: access.params }).catch(() => []);
        return ok({ ...calendar, planned, filters: await cal.calendarFilters(env.DB), can: { schedule: can('schedule'), publish: can('publish') }, plan_can: { create: can('create'), update: can('update') } });
      }
      if (route === 'embargo/get') {
        const item = await accessibleArticle(env, user, url.searchParams.get('id'), 'read');
        if (!item) return fail('News article not found', 404);
        return ok({ embargo: await planner.getEmbargo(env.DB, item.id), can: can('schedule') });
      }
      if (route === 'timezone') return ok({ timezone: await cal.getSiteTimezone(env.DB) });
      if (route === 'safety/status') {
        if (!can('manage_settings')) return fail('Forbidden', 403);
        return ok({ ...(await safety.safetyStatus(env.DB)), health_url: `${url.origin}/en/api/v1/health`, storage: !!env.MEDIA_BUCKET });
      }
      if (route === 'safety/download') {
        if (!can('manage_settings')) return fail('Forbidden', 403);
        const res = await safety.downloadBackup(env, url.searchParams.get('id'));
        await logAudit(env.DB, { userId: user.user_id, action: 'news_backup_downloaded', entityType: 'news_flag', entityId: null, metadata: { id: url.searchParams.get('id') } }).catch(() => {});
        return res || fail('Backup not found', 404);
      }
      if (route === 'commerce/article') {
        const item = await accessibleArticle(env, user, url.searchParams.get('id'), 'read');
        if (!item) return fail('News article not found', 404);
        return ok({ article: { id: item.id, title: item.title, slug: item.slug }, ...(await commerce.getAdminBundle(env.DB, item.id)), flags: await commerce.getCommerceFlags(env.DB) });
      }
      if (route === 'commerce/pick') {
        const access = await itemAccess.getAccessibleWhereClause(env.DB, user, 'news', 'read', 'n');
        return ok({ articles: await nlinks.pickArticles(env.DB, { q: url.searchParams.get('q'), sectionId: url.searchParams.get('section'), topicId: url.searchParams.get('topic'), country: url.searchParams.get('country'), condition: access.condition, params: access.params }) });
      }
      if (route === 'picker/countries') {   // countries at least one article is tagged with (for the article picker)
        const r = await env.DB.prepare(`SELECT c.code, c.name FROM countries c WHERE c.code IN (SELECT primary_country FROM news WHERE primary_country IS NOT NULL UNION SELECT country_code FROM news_article_countries) ORDER BY c.name`).all();
        return ok({ countries: r.results || [] });
      }
      if (route === 'commerce/news-links') return ok({ links: await nlinks.listLinks(env.DB), can_manage: can('manage_settings'), go_base: `${url.origin}/en/go/` });
      if (route === 'commerce/links') return ok({ links: await commerce.listTrackingLinkChoices(env.DB, url.searchParams.get('q')) });
      if (route === 'commerce/images') return ok({ images: await commerce.listImageChoices(env.DB, url.searchParams.get('q')) });
      if (route === 'commerce/inquiries') return ok({ inquiries: await commerce.listInquiries(env.DB, { status: url.searchParams.get('status') || '' }) });
      if (route === 'media/status') {
        if (!can('review')) return fail('Forbidden', 403);
        return ok({ ...(await media.mediaStatus(env.DB)), feed_url: `${url.origin}/en/podcast.xml` });
      }
      if (route === 'import/list') {
        if (!can('manage_settings')) return fail('Forbidden', 403);
        return ok({ imports: await nimport.listImports(env.DB), enabled: (await ops.getOpsFlags(env.DB)).news_import });
      }
      if (route === 'import/mapping.csv') {
        if (!can('manage_settings')) return fail('Forbidden', 403);
        const csv = await nimport.mappingCsv(env.DB, url.searchParams.get('id'), url.origin);
        return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="import-mapping.csv"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
      }
      if (route === 'membership/status') {
        if (!can('review')) return fail('Forbidden', 403);
        return ok({ ...(await membership.membershipStatus(env.DB)), enabled: (await ops.getOpsFlags(env.DB)).news_membership, webhook_url: `${url.origin}/en/api/v1/news/member/webhook` });
      }
      if (route === 'push/status') {
        if (!can('review')) return fail('Forbidden', 403);
        const st = await push.pushStatus(env.DB);
        const live = (await env.DB.prepare(`SELECT id, title FROM news WHERE published = 1 AND (published_at IS NULL OR datetime(published_at) <= datetime('now')) ORDER BY COALESCE(published_at, created_at) DESC LIMIT 20`).all()).results || [];
        return ok({ ...st, live, enabled: (await ops.getOpsFlags(env.DB)).news_web_push });
      }
      if (route === 'comments/list') {
        if (!can('review')) return fail('Forbidden', 403);
        return ok(await comments.listComments(env.DB, { status: url.searchParams.get('status') || 'pending' }));
      }
      if (route === 'ops/summary') {
        if (!can('review')) return fail('Forbidden', 403);
        return ok({ vitals: await ops.vitalsSummary(env.DB, Number(url.searchParams.get('days')) || 28), digests: await ops.digestStats(env.DB), flags: await ops.getOpsFlags(env.DB) });
      }
      if (route === 'export/news.csv') {
        if (!can('review')) return fail('Forbidden', 403);
        if (!(await ops.getOpsFlags(env.DB)).news_csv_export) return fail('CSV export is switched off (Newsroom > Flags)', 403);
        const csv = await ops.exportNewsCsv(env.DB, { status: url.searchParams.get('status') || 'all', from: url.searchParams.get('from') || '', to: url.searchParams.get('to') || '' });
        await logAudit(env.DB, { userId: user.user_id, action: 'news_exported', entityType: 'news', entityId: null, metadata: { status: url.searchParams.get('status') || 'all' } });
        return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="news-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
      }
      if (route === 'indexnow/status') {
        if (!can('manage_settings')) return fail('Forbidden', 403);
        const key = await pro.getIndexNowKey(env.DB);
        return ok({ enabled: await pro.indexNowEnabled(env.DB), key_location: key ? `${pro.originFrom(env, request)}/${key}.txt` : null, pings: await pro.recentPings(env.DB, null, 25) });
      }
      if (route === 'revision') {
        const item = await accessibleArticle(env, user, url.searchParams.get('id'), 'read');
        if (!item) return fail('News article not found', 404);
        const rev = await nr.getRevision(env.DB, item.id, Number(url.searchParams.get('v')), perms);
        return rev ? ok({ revision: rev }) : fail('Revision not found', 404);
      }
      if (route === 'queue') return listQueue(env, user, url, actor);
      if (route === 'trust-pages/list') return can('manage_settings') ? ok({ pages: await trust.listTrustPages(env.DB) }) : fail('Forbidden', 403);
      if (route === 'trust-pages/get') {
        const p = await trust.getTrustPage(env.DB, url.searchParams.get('slug'), perms);
        return p ? ok({ page: { ...p, content: safeParse(p.content_json, p.content_json) } }) : fail('Trust page not found', 404);
      }
      if (route === 'pins/list') {
        const slot = url.searchParams.get('slot');
        if (!(await stats.isPinSlot(env.DB, slot))) return fail('invalid slot');
        const r = await env.DB.prepare(`SELECT p.news_id, p.position, p.starts_at, p.ends_at, n.slug, n.title FROM news_pins p JOIN news n ON n.id = p.news_id WHERE p.slot = ? ORDER BY p.position, p.id`).bind(slot).all();
        return ok({ slot, pins: r.results || [] });
      }
      if (route === 'regions/countries') {
        const region = url.searchParams.get('region');
        const r = await env.DB.prepare(`SELECT country_code FROM news_region_countries WHERE region_slug = ? ORDER BY country_code`).bind(region).all();
        return ok({ region, country_codes: (r.results || []).map((x) => x.country_code) });
      }
      if (route === 'copyright/list') {
        if (!can('retract')) return fail('Forbidden', 403);
        return ok(await audience.listCopyrightReports(env.DB, { status: url.searchParams.get('status') || '' }));
      }
      if (route === 'authors/pick') {   // names only, for the credits picker
        if (!can('update')) return fail('Forbidden', 403);
        const r = await env.DB.prepare(`SELECT id, name FROM authors ORDER BY name LIMIT 500`).all();
        return ok({ authors: r.results || [] });
      }
      if (route === 'authors/list') {
        if (!can('manage_authors')) return fail('Forbidden', 403);
        const r = await env.DB.prepare(`SELECT id, slug, name, role, job_title, expertise, location, website_url, published FROM authors ORDER BY name`).all();   // no email / private columns
        return ok({ authors: r.results || [] });
      }
      if (route === 'analytics/overview') {
        if (!can('view_analytics')) return fail('Forbidden', 403);
        const days = Number(url.searchParams.get('days') || 30);
        const r = await analytics.getOverview(env.DB, env, user, { days, siteHost: url.hostname });
        if (!r.ok) return fail(r.error, r.status);
        const [trending] = await Promise.all([stats.getTrending(env.DB, env, 5)]);
        const { ok: _ok, ...rest } = r;
        return ok({ ...rest, trending: trending.map((a) => ({ id: a.id, slug: a.slug, title: a.title })) });
      }
      if (route === 'analytics/article') {
        if (!can('view_analytics')) return fail('Forbidden', 403);
        const item = await accessibleArticle(env, user, url.searchParams.get('id'), 'read');
        if (!item) return fail('News article not found', 404);
        const r = await analytics.getArticlePerformance(env.DB, item.id, { days: Number(url.searchParams.get('days') || 30), siteHost: url.hostname });
        if (!r.ok) return fail(r.error, r.status);
        const { ok: _ok, ...rest } = r;
        return ok(rest);
      }
      if (route === 'search') {
        const p = search.parseSearchParams(url.searchParams);
        const r = await search.searchNews(env.DB, p, { mode: 'admin', user, pageSize: 25 });
        if (!r.ok) return fail(r.error, r.status);
        return ok({ articles: r.articles, total: r.total, page: r.page, page_size: r.page_size, invalid_filters: r.invalid_filters });
      }
      if (route === 'search/status') {
        if (!can('manage_settings')) return fail('Forbidden', 403);
        return ok({ ...(await search.indexStatus(env.DB)), enabled: await nr.isNewsFlagEnabled(env.DB, 'news_search_v2') });
      }
      if (route === 'slug-conflicts') return ok({ conflicts: await nr.findSlugCollisions(env.DB) }); // articles shadowing a section page
      if (route === 'taxonomy/list') {
        const list = await tx.listTaxonomy(env.DB, url.searchParams.get('kind'), { includeInactive: url.searchParams.get('all') === '1' && can('manage_taxonomy') });
        return list ? ok({ items: list }) : fail('Unknown taxonomy kind', 404);
      }
      if (route === 'flags') {
        if (!can('manage_settings')) return fail('Forbidden', 403);
        const rows = (await env.DB.prepare(`SELECT key, value FROM system_settings WHERE key LIKE 'news_%' ORDER BY key`).all()).results || [];
        return ok({ flags: rows.map((r) => ({ key: r.key, value: String(r.value).toLowerCase() === 'true', ...(FLAG_INFO[r.key] || { label: r.key, help: '' }) })) });
      }
      if (route === 'meta') return ok({
        article_types: nr.ARTICLE_TYPES, content_classes: nr.CONTENT_CLASSES, labels: nr.LABELS, source_types: nr.SOURCE_TYPES,
        correction_types: nr.CORRECTION_TYPES, relation_types: nr.RELATION_TYPES, workflow_statuses: nr.WORKFLOW_STATUSES,
        fact_check_statuses: nr.FACT_CHECK_STATUSES, entity_types: tx.ENTITY_TYPES, author_roles: NEWSROOM_ROLES,
        workflow_enabled: await nr.isNewsFlagEnabled(env.DB, 'news_editorial_workflow'),
        regions: (await env.DB.prepare(`SELECT slug, name FROM news_regions WHERE active = 1 ORDER BY display_order`).all()).results || [],
        permissions: {   // lets the UI hide controls the server would refuse; the server still enforces everything
          manage_taxonomy: can('manage_taxonomy'), manage_sources: can('manage_sources'), correct: can('correct'),
          retract: can('retract'), manage_settings: can('manage_settings'), manage_authors: can('manage_authors'), view_analytics: can('view_analytics'), factcheck: can('factcheck'), review: can('review'), publish: can('publish'), schedule: can('schedule'), update: can('update')
        }
      });
      return fail('Not found', 404);
    }

    // ---------- writes ----------
    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const body = parsed.body;

    if (route === 'flags/save') {
      if (!can('manage_settings')) return fail('Forbidden', 403);
      const updates = body && typeof body === 'object' && body.flags && typeof body.flags === 'object' ? body.flags : { [body?.key]: body?.value };
      const entries = Object.entries(updates).filter(([, v]) => v !== undefined);
      if (!entries.length) return fail('No flags given');
      // Allow-list: only keys that already exist as news_* rows can be written -- this can never
      // create a new arbitrary system_settings row or touch a non-newsroom setting.
      const existing = new Set(((await env.DB.prepare(`SELECT key FROM system_settings WHERE key LIKE 'news_%'`).all()).results || []).map((r) => r.key));
      for (const [key] of entries) if (!existing.has(key)) return fail(`Unknown flag: ${key}`, 400);
      for (const [key, value] of entries) {
        await env.DB.prepare(`UPDATE system_settings SET value = ? WHERE key = ?`).bind(value ? 'true' : 'false', key).run();
      }
      resetNewsFlagCache();   // takes effect immediately instead of waiting out the 30s cache
      audience.forgetAudienceFlags(env.DB); audience.forgetFooterTrust(env.DB); ops.forgetOpsFlags(env.DB); commerce.forgetCommerceFlags(env.DB);
      await logAudit(env.DB, { userId: user.user_id, action: 'taxonomy_changed', entityType: 'news_flag', entityId: null, metadata: { updated: Object.fromEntries(entries.map(([k, v]) => [k, !!v])) } });
      return ok({ updated: entries.length });
    }
    if (route === 'commerce/save') {
      const item = await accessibleArticle(env, user, body.id, 'update');
      if (!item || !can('update')) return fail('News article not found', 404);
      const r = await commerce.saveAdminBundle(env.DB, item.id, body, { userId: user.user_id });
      if (!r.ok) return fail(r.error, 400);
      await logAudit(env.DB, { userId: user.user_id, action: 'news_commerce_saved', entityType: 'news', entityId: String(item.id), metadata: { mode: body.config && body.config.mode, widgets: r.widgets, gallery: r.gallery } }).catch(() => {});
      await invalidateNews(env);
      return ok({ widgets: r.widgets, gallery: r.gallery });
    }
    if (route === 'commerce/link-save' || route === 'commerce/link-status' || route === 'commerce/link-delete') {
      if (!can('manage_settings')) return fail('Forbidden', 403);
      const r = route === 'commerce/link-save' ? await nlinks.saveLink(env.DB, body, { userId: user.user_id })
        : route === 'commerce/link-status' ? await nlinks.setLinkStatus(env.DB, body.id, body.status) : await nlinks.deleteLink(env.DB, body.id);
      if (!r.ok) return fail(r.error, r.status || 400);
      await logAudit(env.DB, { userId: user.user_id, action: route === 'commerce/link-delete' ? 'news_link_deleted' : 'news_link_saved', entityType: 'news_flag', entityId: null, metadata: { id: body.id || r.id || null, code: r.code || null } }).catch(() => {});
      return ok({ id: r.id || null, code: r.code || null, created: !!r.created });
    }
    if (route === 'commerce/inquiry-status') {
      if (!can('update')) return fail('Forbidden', 403);
      const r = await commerce.setInquiryStatus(env.DB, body.id, body.status);
      return r.ok ? ok({}) : fail(r.error, r.status || 400);
    }
    if (route === 'taxonomy/save') {
      const r = await tx.saveTaxonomyItem(env.DB, body.kind, body, { actor, perms });
      if (r.ok) await invalidateNews(env);
      return fromResult(r, { slug: r.slug });
    }
    if (route === 'taxonomy/archive') {
      const r = await tx.archiveTaxonomyItem(env.DB, body.kind, body.id, { actor, perms, active: body.active === true });
      if (r.ok) await invalidateNews(env);
      return fromResult(r);
    }
    if (route === 'trust-pages/create') {
      const r = await trust.createTrustDraft(env.DB, body.slug, { actor, perms });
      return fromResult(r);
    }
    if (route === 'trust-pages/save') {
      const r = await trust.saveTrustPage(env.DB, body, { actor, perms });
      if (r.ok) await invalidateNews(env);
      return r.ok ? ok({ published: r.published }) : fail(r.error, r.status);
    }
    if (route === 'timezone/save') {
      if (!can('manage_settings')) return fail('Forbidden', 403);
      const r = await cal.saveSiteTimezone(env.DB, body.timezone);
      if (!r.ok) return fail(r.error, 400);
      await logAudit(env.DB, { userId: user.user_id, action: 'news_timezone_changed', entityType: 'news_flag', entityId: null, metadata: { timezone: r.timezone } }).catch(() => {});
      return ok({ timezone: r.timezone });
    }
    if (route === 'safety/backup' || route === 'safety/check' || route === 'safety/test-alert' || route === 'safety/config') {
      if (!can('manage_settings')) return fail('Forbidden', 403);
      if (route === 'safety/backup') {
        if (!(await ops.getOpsFlags(env.DB)).news_backups) return fail('Turn on "Content backups" in Flags first', 400);
        const r = await safety.runBackup(env, { kind: 'manual', actor: user.user_id });
        await logAudit(env.DB, { userId: user.user_id, action: 'news_backup_created', entityType: 'news_flag', entityId: null, metadata: { ok: r.ok } }).catch(() => {});
        return r.ok ? ok({ bytes: r.bytes, tables: r.tables, truncated: r.truncated }) : fail(r.error, 500);
      }
      if (route === 'safety/check') {
        if (!(await ops.getOpsFlags(env.DB)).news_monitoring) return fail('Turn on "Uptime and error alerts" in Flags first', 400);
        return ok(await safety.runMonitor(env, { render: () => fetch(new Request(url.origin + '/en', { headers: { 'user-agent': 'newsroom-monitor' } })) }));
      }
      if (route === 'safety/test-alert') return ok(await safety.sendTestAlert(env));
      const r = await safety.saveMonitorConfig(env.DB, body);
      return r.ok ? ok({ saved: true }) : fail(r.error, 400);
    }
    if (route === 'media/podcast') {
      if (!can('manage_settings')) return fail('Forbidden', 403);
      const r = await media.savePodcastConfig(env.DB, body);
      if (!r.ok) return fail(r.error, 400);
      await logAudit(env.DB, { userId: user.user_id, action: 'podcast_config', entityType: 'news_flag', entityId: null, metadata: {} }).catch(() => {});
      return ok({ saved: true });
    }
    if (route === 'import/preview' || route === 'import/run') {
      if (!can('manage_settings')) return fail('Forbidden', 403);
      const r = route === 'import/preview' ? await nimport.previewImport(env, body) : await nimport.runImport(env, { ...body, actor });
      if (!r.ok) return fail(r.error, r.status);
      const { ok: _ok, status: _s, ...rest } = r;
      return ok(rest);
    }
    if (route === 'membership/setup') {
      if (!can('manage_settings')) return fail('Forbidden', 403);
      const r = await membership.setupMembership(env.DB, { rotateWebhook: body.rotate_webhook === true });
      return ok({ webhook_secret: r.webhookSecret });
    }
    if (route === 'membership/access') {
      if (!can('publish')) return fail('Forbidden', 403);
      const r = await membership.setArticleAccess(env.DB, { newsId: body.news_id, level: body.level, preview: body.preview_paragraphs, actor });
      if (r.ok) await invalidateNews(env);
      return r.ok ? ok() : fail(r.error, r.status);
    }
    if (route === 'membership/grant') {
      if (!can('manage_settings')) return fail('Forbidden', 403);
      const r = await membership.grantMember(env.DB, { email: body.email, tier: body.tier, expiresAt: body.expires_at, note: body.note, actor });
      return r.ok ? ok() : fail(r.error, r.status);
    }
    if (route === 'membership/revoke') {
      if (!can('manage_settings')) return fail('Forbidden', 403);
      const r = await membership.revokeMember(env.DB, { id: body.id, actor });
      return r.ok ? ok() : fail(r.error, r.status);
    }
    if (route === 'push/setup') {
      if (!can('manage_settings')) return fail('Forbidden', 403);
      const r = await push.setupVapid(env.DB, { contact: body.contact, regenerate: body.regenerate === true });
      await logAudit(env.DB, { userId: user.user_id, action: 'taxonomy_changed', entityType: 'news_push', entityId: null, metadata: { created: r.created } });
      return ok({ created: r.created });
    }
    if (route === 'push/announce') {
      if (!can('review')) return fail('Forbidden', 403);
      const r = await push.announce(env, { newsId: body.news_id, actor, origin: pro.originFrom(env, request) });
      if (!r.ok) return fail(r.error, r.status);
      await push.runPushQueue(env);   // first batch right away; the scheduled job finishes the rest
      return ok({ id: r.id });
    }
    if (route === 'comments/moderate') {
      if (!can('review')) return fail('Forbidden', 403);
      const r = await comments.moderateComment(env.DB, { id: body.id, status: body.status, actor });
      if (r.ok) await invalidateNews(env);
      return r.ok ? ok() : fail(r.error, r.status);
    }
    if (route === 'comments/close') {
      if (!can('review')) return fail('Forbidden', 403);
      const r = await comments.setDiscussionClosed(env.DB, { newsId: body.news_id, closed: body.closed === true, actor });
      if (r.ok) await invalidateNews(env);
      return r.ok ? ok() : fail(r.error, r.status);
    }
    if (route === 'copyright/update') {
      const r = await audience.updateCopyrightReport(env.DB, { id: Number(body.id), status: body.status, resolution: body.resolution, unpublish: body.unpublish === true, actor, perms });
      if (r.ok && r.unpublished) await invalidateNews(env);
      return r.ok ? ok({ unpublished: r.unpublished }) : fail(r.error, r.status);
    }
    if (route === 'pins/save') {
      if (!can('review')) return fail('Forbidden', 403);   // editors' lead / above; grantable from the Permissions page
      const r = await stats.savePins(env.DB, body.slot, body.items, { actor });
      if (!r.ok) return fail(r.error, r.status);
      await logAudit(env.DB, { userId: user.user_id, action: 'article_updated', entityType: 'news_pins', entityId: null, metadata: { slot: body.slot, count: r.count } });
      return ok({ count: r.count });
    }
    if (route === 'search/reindex') {
      if (!can('manage_settings')) return fail('Forbidden', 403);
      const r = await search.reindexBatch(env.DB, { cursor: Number(body.cursor) || 0, limit: Number(body.limit) || 25, force: body.force === true });
      return ok(r);
    }
    if (route === 'regions/countries/save') {
      const r = await nr.setRegionCountries(env.DB, body.region_slug, body.country_codes, { actor, perms });
      if (r.ok) await invalidateNews(env);
      return r.ok ? ok({ count: r.count }) : fail(r.error, r.status);
    }
    if (route === 'authors/profile/save') return saveAuthorProfile(env, body, actor, perms);
    if (route === 'media/credit/save') return saveMediaCredit(env, body, actor, perms);

    if (route === 'calendar/create') {
      const r = await planner.createPlanned(env.DB, { title: body.title, at: body.at, sectionId: body.section_id, actor, perms });
      return r.ok ? ok({ id: r.id }) : fail(r.error, r.status);
    }
    if (route === 'bulk/apply') {
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
      if (!ids.length) return fail('Pick at least one story');
      if (ids.length > planner.MAX_BULK) return fail(`Pick at most ${planner.MAX_BULK} stories at a time`);
      const action = String(body.action || '');
      const META = { section: 'section_id', article_type: 'article_type', country: 'primary_country' };
      if (!(action in META) && !['topic_add', 'topic_remove', 'workflow', 'embargo'].includes(action)) return fail('Unknown bulk action');
      const done = [], failed = [];
      for (const id of ids) {
        const item = await accessibleArticle(env, user, id, 'update');
        if (!item) { failed.push({ id, error: 'Not found, or you cannot edit it' }); continue; }
        let r;
        try {
          if (action in META) {
            const before = await snapshot(env.DB, id);
            r = await tx.setArticleMeta(env.DB, id, { [META[action]]: body.value === '' ? null : body.value }, { actor, perms });
            if (r.ok) { const after = await snapshot(env.DB, id); await safeRevision(env.DB, id, actor, before, after, `Bulk change: ${action}`); await search.reindexArticle(env.DB, id).catch(() => {}); }
          } else if (action === 'topic_add' || action === 'topic_remove') {
            r = await planner.setTopic(env.DB, { id, topicId: body.value, remove: action === 'topic_remove', actor, perms });
            if (r.ok) await search.reindexArticle(env.DB, id).catch(() => {});
          } else if (action === 'embargo') {
            r = await planner.setEmbargo(env.DB, { id, until: body.value || null, note: body.note, actor, perms });
          } else {
            if (!(await nr.isNewsFlagEnabled(env.DB, 'news_editorial_workflow'))) return fail('Editorial workflow is not enabled', 404);
            r = await nr.transitionWorkflow(env.DB, { newsId: id, to: body.value, actor, perms, scheduledAt: body.scheduled_at });
          }
        } catch (e) { console.error('bulk failed:', e.message); r = { ok: false, error: 'Something went wrong with this story' }; }
        if (r && r.ok) done.push(id); else failed.push({ id, error: (r && r.error) || 'Failed' });
      }
      if (done.length) await invalidateNews(env);
      return ok({ done, failed });
    }

    // per-article writes: item access first (404 hides existence), then permission
    const item = await accessibleArticle(env, user, body.id, route === 'workflow/assign' || route.startsWith('corrections') ? 'read' : 'update');
    if (!item) return fail('News article not found', 404);

    if (route === 'article/meta/save') {
      if (!can('update')) return fail('Forbidden', 403);
      const before = await snapshot(env.DB, item.id);
      const meta = await tx.setArticleMeta(env.DB, item.id, body.meta || {}, { actor, perms });
      if (!meta.ok) return fromResult(meta);
      let rel = { ok: true, changed: [] };
      if (body.relations && typeof body.relations === 'object') {
        rel = await tx.setArticleRelations(env.DB, item.id, body.relations, { actor, perms });
        if (!rel.ok) return fromResult(rel); // meta already saved; relations validated-before-write so nothing partial in rel
      }
      const after = await snapshot(env.DB, item.id);
      const version = await safeRevision(env.DB, item.id, actor, before, after, body.change_summary);
      await search.reindexArticle(env.DB, item.id);   // section / entity / topic names are searchable
      await invalidateNews(env);
      return ok({ changed: [...meta.changed, ...rel.changed], revision: version });
    }
    if (route === 'bylines/save') {
      const r = await pro.saveBylines(env.DB, { newsId: item.id, items: body.bylines, actor, perms });
      if (r.ok) await invalidateNews(env);
      return r.ok ? ok({ count: r.count }) : fail(r.error, r.status);
    }
    if (route === 'revision/restore') {
      const r = await pro.restoreVersion(env.DB, { newsId: item.id, version: body.version, actor, perms });
      if (!r.ok) return fail(r.error, r.status);
      if (r.changed.length) {
        await search.reindexArticle(env.DB, item.id).catch(() => {});
        await invalidateNews(env);
        await pro.pingArticleById(env, request, item.id, 'updated');
      }
      return ok({ changed: r.changed, revision: r.revision, drift: !!r.drift });
    }
    if (route === 'calendar/plan') {
      const r = await planner.setPlan(env.DB, { id: item.id, at: body.at, actor, perms });
      return r.ok ? ok({ planned_at: r.planned_at }) : fail(r.error, r.status);
    }
    if (route === 'embargo/save') {
      const r = await planner.setEmbargo(env.DB, { id: item.id, until: body.until, note: body.note, actor, perms });
      if (r.ok) await invalidateNews(env);
      return r.ok ? ok({ embargo: r.embargo }) : fail(r.error, r.status);
    }
    if (route === 'calendar/reschedule' || route === 'calendar/unschedule' || route === 'calendar/publish-now') {
      const args = { id: item.id, expected: body.expected, actor, perms };
      const r = route === 'calendar/reschedule' ? await cal.rescheduleArticle(env.DB, { ...args, at: body.at })
        : route === 'calendar/unschedule' ? await cal.unscheduleArticle(env.DB, args) : await cal.publishNowArticle(env.DB, args);
      if (!r.ok) return fail(r.error, r.status);
      await invalidateNews(env);
      if (route === 'calendar/publish-now') await pro.pingArticleById(env, request, item.id, 'published').catch(() => {});
      return ok({ published_at: r.published_at || null });
    }
    if (route === 'indexnow/ping') {
      if (!can('publish') && !can('manage_settings')) return fail('Forbidden', 403);
      if (!(await pro.indexNowEnabled(env.DB))) return fail('Turn on "Tell search engines about new articles (IndexNow)" in the Flags tab first', 409);
      const r = await pro.pingArticleById(env, request, item.id, 'manual');
      if (!r) return fail('The article is not live, so there is nothing to send', 409);
      return r.ok ? ok({ sent: r.sent }) : ok({ sent: 0, note: r.skipped || 'The search engine did not accept the request' });
    }
    if (route === 'sources/save') {
      const r = await nr.replaceArticleSources(env.DB, { newsId: item.id, sources: body.sources, actor, perms });
      if (r.ok) await invalidateNews(env);
      return r.ok ? ok({ count: r.count }) : fail(r.error, r.status);
    }
    if (route === 'corrections/add') {
      const r = await nr.addCorrection(env.DB, { newsId: item.id, type: body.type, message: body.public_message, actor, perms });
      if (!r.ok) return fromResult(r);
      // Keep internal workflow status in step, when the workflow is on. Best-effort.
      if (await nr.isNewsFlagEnabled(env.DB, 'news_editorial_workflow')) {
        const to = body.type === 'retraction' ? 'retracted' : body.type === 'correction' ? 'corrected' : null;
        if (to) await nr.transitionWorkflow(env.DB, { newsId: item.id, to, actor, perms }).catch(() => {});
      }
      await invalidateNews(env);
      await pro.pingArticleById(env, request, item.id, 'corrected');
      return ok({ id: r.id });
    }
    if (route === 'timeline/add') {
      if (!can('update')) return fail('Forbidden', 403);
      const text = nr.plainText(body.body, 2000);
      if (!text) return fail('body is required');
      const cur = await env.DB.prepare(`SELECT article_type FROM news WHERE id = ?`).bind(item.id).first();
      if (cur?.article_type !== 'live') return fail('Timeline updates are only available on Live / Developing articles', 409);
      const editor = body.editor_author_id == null ? null : Number(body.editor_author_id);
      if (editor !== null && !Number.isInteger(editor)) return fail('invalid editor_author_id');
      await env.DB.prepare(`INSERT INTO news_timeline_updates (news_id, body, editor_id) VALUES (?, ?, ?)`).bind(item.id, text, editor).run();
      await logAudit(env.DB, { userId: user.user_id, action: 'article_updated', entityType: 'news', entityId: item.id, metadata: { timeline: true } });
      await invalidateNews(env);
      return ok();
    }

    // workflow endpoints: behind the feature flag
    if (route === 'workflow/transition' || route === 'workflow/assign' || route === 'factcheck/save') {
      if (!(await nr.isNewsFlagEnabled(env.DB, 'news_editorial_workflow'))) return fail('Editorial workflow is not enabled', 404);

      if (route === 'workflow/transition') {
        const r = await nr.transitionWorkflow(env.DB, { newsId: item.id, to: body.to, actor, perms, scheduledAt: body.scheduled_at });
        if (r.ok) { await invalidateNews(env); if (['published', 'updated', 'corrected'].includes(r.to)) await pro.pingArticleById(env, request, item.id, r.to === 'published' ? 'published' : 'updated'); }
        return r.ok ? ok({ from: r.from, to: r.to }) : fail(r.error, r.status);
      }
      if (route === 'factcheck/save') {
        const r = await nr.setFactCheck(env.DB, { newsId: item.id, status: body.status, notes: body.notes, actor, perms });
        return fromResult(r);
      }
      if (route === 'workflow/assign') {
        if (!can('review')) return fail('Forbidden', 403);
        const assignee = body.assigned_to == null ? null : Number(body.assigned_to);
        if (assignee !== null) {
          const u = Number.isInteger(assignee) ? await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(assignee).first() : null;
          if (!u) return fail('Unknown user');
        }
        await env.DB.prepare(`INSERT OR IGNORE INTO news_editorial (news_id) VALUES (?)`).bind(item.id).run();
        await env.DB.prepare(`UPDATE news_editorial SET assigned_to = ?, assignment_notes = COALESCE(?, assignment_notes), updated_at = CURRENT_TIMESTAMP WHERE news_id = ?`)
          .bind(assignee, body.assignment_notes ? nr.plainText(body.assignment_notes, 2000) : null, item.id).run();
        await logAudit(env.DB, { userId: user.user_id, action: 'article_updated', entityType: 'news', entityId: item.id, metadata: { assigned_to: assignee } });
        return ok();
      }
    }
    return fail('Not found', 404);
  } catch (e) {
    console.error('newsroom api error:', route, e.message);
    return fail('Internal error', 500);
  }
}

// ── helpers ──────────────────────────────────────────────────
async function snapshot(db, id) {
  return await db.prepare(`SELECT ${nr.TRACKED_FIELDS.join(', ')} FROM news WHERE id = ?`).bind(id).first(); // columns from fixed constant
}
async function safeRevision(db, newsId, actor, before, after, summary) {
  try { return await nr.recordRevision(db, { newsId, changedBy: actor.user_id, before, after, summary }); }
  catch (e) { console.error('revision failed:', e.message); return null; }
}

async function loadBundle(db, id, perms) {
  const q = (sql, ...p) => db.prepare(sql).bind(...p).all().then(r => r.results || []);
  const [article, sources, corrections, timeline, topics, countries, entities, series, related, editorial, revisions, bylines, pings] = await Promise.all([
    db.prepare(`SELECT id, slug, title, published, published_at, article_type, section_id, primary_country, region_slug, content_class, labels,
                       methodology, pr_provided_by, pr_original_source_url, pr_original_date, disclosure_json, updated_at
                FROM news WHERE id = ?`).bind(id).first(),
    nr.getPublicSources(db, id), nr.getPublicCorrections(db, id), nr.getPublicTimeline(db, id),
    q(`SELECT t.id, t.slug, t.name FROM news_article_topics x JOIN news_topics t ON t.id = x.topic_id WHERE x.news_id = ?`, id),
    q(`SELECT country_code, is_primary FROM news_article_countries WHERE news_id = ?`, id),
    q(`SELECT e.id, e.slug, e.name, e.entity_type, x.role FROM news_article_entities x JOIN news_entities e ON e.id = x.entity_id WHERE x.news_id = ? ORDER BY x.display_order`, id),
    q(`SELECT s.id, s.slug, s.name, x.position FROM news_series_articles x JOIN news_series s ON s.id = x.series_id WHERE x.news_id = ?`, id),
    q(`SELECT r.related_news_id AS news_id, r.relation_type, n.slug, n.title FROM news_related r JOIN news n ON n.id = r.related_news_id WHERE r.news_id = ? ORDER BY r.display_order`, id),
    nr.getEditorialState(db, id, perms),
    nr.listRevisions(db, id, perms),
    pro.getPublicBylines(db, id),
    pro.recentPings(db, id, 5).catch(() => [])
  ]);
  return { article: { ...article, labels: safeParse(article?.labels, []), disclosure: safeParse(article?.disclosure_json, {}) }, sources, corrections, timeline, topics, countries, entities, series, related, editorial, revisions, bylines, pings };
}
const safeParse = (s, f) => { try { return s ? JSON.parse(s) : f; } catch { return f; } };

async function listQueue(env, user, url, actor) {
  const view = url.searchParams.get('view') || 'drafts';
  if (!QUEUE_VIEWS.includes(view)) return fail('Unknown view');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
  const cond = {
    drafts: `n.published = 0`,
    assigned_to_me: `e.assigned_to = ?`,
    review: `e.workflow_status = 'editorial_review'`,
    factcheck: `e.workflow_status = 'fact_check'`,
    approved: `e.workflow_status = 'approved'`,
    scheduled: `n.published = 1 AND n.published_at IS NOT NULL AND datetime(n.published_at) > datetime('now')`,
    published: `n.published = 1 AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))`,
    corrections: `EXISTS (SELECT 1 FROM news_corrections c WHERE c.news_id = n.id)`
  }[view]; // fixed strings only
  const params = view === 'assigned_to_me' ? [actor.user_id] : [];
  const scope = await itemAccess.getAccessibleWhereClause(env.DB, user, 'news', 'read', 'n');
  const where = [cond, scope.condition].filter(Boolean).join(' AND ');
  const r = await env.DB.prepare(`
    SELECT n.id, n.slug, n.title, n.published, n.published_at, n.updated_at, n.article_type,
           e.workflow_status, e.assigned_to, e.fact_check_status
    FROM news n LEFT JOIN news_editorial e ON e.news_id = n.id
    WHERE ${where} ORDER BY n.updated_at DESC, n.id DESC LIMIT ? OFFSET ?
  `).bind(...params, ...scope.params, limit, offset).all();
  return ok({ view, items: r.results || [] });
}

const VALID_HTTP = (v) => nr.validatePublicUrl(v);

async function saveAuthorProfile(env, body, actor, perms) {
  if (!permDB.checkPermission(perms, 'news', 'manage_authors')) return fail('Forbidden', 403);
  const id = Number(body.id);
  if (!Number.isInteger(id)) return fail('invalid id');
  const sets = {};
  if (body.job_title !== undefined) sets.job_title = nr.plainText(body.job_title, 120) || null;
  if (body.expertise !== undefined) sets.expertise = nr.plainText(body.expertise, 500) || null;
  if (body.location !== undefined) sets.location = nr.plainText(body.location, 120) || null;
  if (body.website_url !== undefined) { const u = VALID_HTTP(body.website_url); if (!u.ok) return fail(`website_url: ${u.error}`); sets.website_url = u.value; }
  if (body.role !== undefined) {
    if (body.role !== null && !NEWSROOM_ROLES.includes(body.role)) return fail('invalid role');
    sets.role = body.role; // displayed as plain text on author pages already
  }
  const cols = Object.keys(sets);
  if (!cols.length) return fail('nothing to update');
  const r = await env.DB.prepare(`UPDATE authors SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map(c => sets[c]), id).run(); // columns from fixed set above
  if (!r.meta?.changes) return fail('Author not found', 404);
  await logAudit(env.DB, { userId: actor.user_id, action: 'author_changed', entityType: 'author', entityId: id, metadata: { fields: cols } });
  await invalidateNews(env);
  return ok();
}

async function saveMediaCredit(env, body, actor, perms) {
  if (!permDB.checkPermission(perms, 'media', 'create')) return fail('Forbidden', 403);
  const id = Number(body.id);
  if (!Number.isInteger(id)) return fail('invalid id');
  const sets = {};
  for (const [k, max] of [['credit', 200], ['photographer', 200], ['credit_source', 300], ['license', 200], ['caption', 500], ['alt_text', 300]]) {
    if (body[k] !== undefined) sets[k] = nr.plainText(body[k], max) || null;
  }
  const cols = Object.keys(sets);
  if (!cols.length) return fail('nothing to update');
  const r = await env.DB.prepare(`UPDATE media_library SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map(c => sets[c]), id).run(); // columns from fixed list above
  if (!r.meta?.changes) return fail('Media not found', 404);
  await logAudit(env.DB, { userId: actor.user_id, action: 'article_updated', entityType: 'media', entityId: id, metadata: { credit_fields: cols } });
  return ok();
}

// Called by the existing update handler after a successful save. Independent of
// the workflow flag: a renamed article must keep answering on its old URL.
// Keeps the search index in step with saves. Best-effort, never throws.
export async function searchReindexHook(env, slug) {
  try { return await search.reindexBySlug(env.DB, slug); } catch { return null; }
}

export async function slugRedirectHook(env, body) {
  return nr.recordSlugRedirect(env.DB, { oldSlug: body?.old_slug, newSlug: body?.slug });
}

// ── Save-path hooks for the EXISTING /api/v1/news/update ─────
// Inert unless news_editorial_workflow is on. Never throws into the save:
// on any internal error the existing behaviour proceeds unchanged.
export async function beforeNewsUpdate(env, user, body) {
  try {
    const workflow = await nr.isNewsFlagEnabled(env.DB, 'news_editorial_workflow');
    if (!workflow) {
      // Workflow off: legacy saving is unchanged. Only a revision is recorded, when that switch is on.
      if (!(await nr.isNewsFlagEnabled(env.DB, 'news_revision_history'))) return { enabled: false };
      const prev = await env.DB.prepare(`SELECT id, ${nr.TRACKED_FIELDS.join(', ')} FROM news WHERE slug = ?`).bind(body.old_slug).first();
      return prev ? { enabled: true, revisionOnly: true, before: prev } : { enabled: false };
    }
    const beforeRow = await env.DB.prepare(`SELECT id, ${nr.TRACKED_FIELDS.join(', ')} FROM news WHERE slug = ?`).bind(body.old_slug).first();
    if (!beforeRow) return { enabled: false };
    const ed = await env.DB.prepare(`SELECT workflow_status FROM news_editorial WHERE news_id = ?`).bind(beforeRow.id).first();

    // Articles that have entered the workflow (have an editorial row) may not
    // be published/unpublished through plain "update" by users lacking publish.
    // Legacy articles (no editorial row) keep today's simple publishing.
    if (ed) {
      const perms = await permDB.getPermissionsForUser(env.DB, user);
      const wouldPublish = body.published === undefined ? true : !!body.published;   // mirrors news.updateNews default
      const isPublished = beforeRow.published === 1;
      if (wouldPublish !== isPublished && !permDB.checkPermission(perms, 'news', 'publish')) {
        return { enabled: true, denied: { status: 403, error: 'Changing publication state requires the news.publish permission for articles in the editorial workflow' } };
      }
    }
    return { enabled: true, before: beforeRow };
  } catch (e) {
    console.error('newsroom beforeNewsUpdate failed (proceeding with legacy behaviour):', e.message);
    return { enabled: false };
  }
}

export async function afterNewsUpdate(env, user, body, ctx) {
  if (!ctx?.enabled || !ctx.before) return;
  try {
    const before = ctx.before;
    // Protect schedules: the legacy update writes published_at = NULL when the
    // form omits it, which would silently publish a scheduled article now.
    const wasFuture = !ctx.revisionOnly && before.published_at && Date.parse(String(before.published_at).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(before.published_at)) ? '' : 'Z')) > Date.now();
    if (wasFuture && !body.published_at) {
      await env.DB.prepare(`UPDATE news SET published_at = ? WHERE id = ?`).bind(before.published_at, before.id).run();
    }
    const after = await snapshot(env.DB, before.id);
    const version = await safeRevision(env.DB, before.id, { user_id: user.user_id }, before, after, body.change_summary);
    await logAudit(env.DB, { userId: user.user_id, action: 'article_updated', entityType: 'news', entityId: before.id, metadata: { revision: version } });
  } catch (e) {
    console.error('newsroom afterNewsUpdate failed (save already applied):', e.message);
  }
}
