// ============================================================
// en/worker/newsroom-analytics.js  --  Stage J: newsroom analytics
//
// Reads the EXISTING analytics_events / newsletter_subscribers tables (no new
// tracking system). Two rules shape this module:
//
//  1. HONESTY ABOUT DATA. News page views are logged as CONTENT_VIEW with only
//     country, city, raw referrer and landing page. Unless the enrichment flag
//     was on, there is no visitor hash, session, device, UTM or bot flag. So
//     unique visitors, device split and campaign traffic are reported as
//     `available: false` instead of being invented, and every response carries
//     a `data_quality` block the UI shows to editors.
//  2. SAFE ACCESS. Every query is constrained by the caller's item-level access
//     to news (getAccessibleWhereClause) BEFORE aggregating, like the rest of
//     the analytics code, and joins `news` so deleted/unknown ids never count.
//
// Results for unrestricted callers are cached in KV for 10 minutes.
// ============================================================

import { getAccessibleWhereClause } from './database/item-access.js';
import { getCached, setCached } from './cache.js';

const VIEW_TYPES = `('PAGE_VIEW','CONTENT_VIEW')`;
export const RANGES = { 7: 7, 30: 30, 90: 90 };
const CACHE_TTL = 600;

// ── classification helpers (pure) ────────────────────────────
const BOT_UA = /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor|python-requests|curl\/|wget\/|httpclient|okhttp|axios|go-http-client|java\/|scrapy/i;
export const isBotUserAgent = (ua) => !ua || BOT_UA.test(String(ua));   // an empty UA is not a browser

export function deviceTypeFromUserAgent(ua) {
  const s = String(ua || '');
  if (!s) return 'unknown';
  if (isBotUserAgent(s)) return 'bot';
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(s)) return 'tablet';
  if (/mobi|iphone|ipod|android|windows phone/i.test(s)) return 'mobile';
  return 'desktop';
}

const clip = (v, n = 120) => (v == null || v === '' ? null : String(v).slice(0, n));
export function parseUtm(url) {
  try {
    const p = new URL(url).searchParams;
    return { utmSource: clip(p.get('utm_source')), utmMedium: clip(p.get('utm_medium')), utmCampaign: clip(p.get('utm_campaign')), utmTerm: clip(p.get('utm_term')), utmContent: clip(p.get('utm_content')) };
  } catch { return {}; }
}

// Extra fields for the EXISTING CONTENT_VIEW event (used only when the flag is on).
export function enrichNewsView(request) {
  const ua = request.headers.get('user-agent') || '';
  return { isBot: isBotUserAgent(ua), deviceType: deviceTypeFromUserAgent(ua), ...parseUtm(request.url) };
}

// The engine name must be followed by a plain TLD, so "google.evil.com" is a referral, not search.
const SEARCH_HOSTS = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|brave|startpage|qwant|naver|seznam)\.(com|org|net|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/i;
const SOCIAL_HOSTS = /(^|\.)(facebook|fb|instagram|twitter|x|t|linkedin|lnkd|reddit|youtube|youtu|tiktok|pinterest|threads|bsky|mastodon|telegram|whatsapp|discord|medium)\.(com|be|co|social|app|me|ly|in|gg|org)$/i;

export function hostOf(url) { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; } }

// -> { channel: direct|internal|search|social|newsletter|paid|referral, host }
export function classifyTraffic({ referrer, utmMedium, utmSource, siteHost }) {
  const medium = String(utmMedium || '').toLowerCase(), source = String(utmSource || '').toLowerCase();
  if (/^(email|e-mail|newsletter)$/.test(medium) || /newsletter/.test(source)) return { channel: 'newsletter', host: null };
  if (/^(cpc|ppc|paid|paidsearch|display|affiliate)$/.test(medium)) return { channel: 'paid', host: hostOf(referrer) };
  const host = referrer ? hostOf(referrer) : null;
  if (!referrer || !host) return { channel: 'direct', host: null };
  const mine = String(siteHost || '').toLowerCase().replace(/^www\./, '');
  if (mine && (host === mine || host.endsWith('.' + mine))) return { channel: 'internal', host };
  if (SEARCH_HOSTS.test(host)) return { channel: 'search', host };
  if (SOCIAL_HOSTS.test(host)) return { channel: 'social', host };
  return { channel: 'referral', host };
}

// Deterministic order: most views first, ties broken alphabetically (SQL GROUP BY gives no stable tie order).
const byViews = (nameKey) => (x, y) => (y.views - x.views) || String(x[nameKey] ?? '').localeCompare(String(y[nameKey] ?? ''));

// ── shared query pieces ──────────────────────────────────────
async function scopeFor(db, user) {
  const s = await getAccessibleWhereClause(db, user, 'news', 'read', 'n');
  return { condition: s.condition || '', params: s.params || [], unrestricted: !s.condition };
}
const eventWhere = (scope) => `e.event_type IN ${VIEW_TYPES} AND e.news_id IS NOT NULL AND e.is_bot = 0 AND e.is_duplicate = 0 AND e.occurred_at >= datetime('now', ?)${scope.condition ? ` AND ${scope.condition}` : ''}`;
const sinceParam = (days) => `-${days} day`;

// ── overview ─────────────────────────────────────────────────
export async function getOverview(db, env, user, { days = 30, siteHost = '' } = {}) {
  if (!RANGES[days]) return { ok: false, status: 400, error: 'days must be 7, 30 or 90' };
  const scope = await scopeFor(db, user);
  const key = `news:analytics:overview:${days}:${siteHost}`;
  if (scope.unrestricted) { const hit = await getCached(env, key); if (hit) return { ok: true, ...hit, cached: true }; }

  const since = sinceParam(days);
  const base = (select, tail = '') => db.prepare(`SELECT ${select} FROM analytics_events e JOIN news n ON n.id = e.news_id WHERE ${eventWhere(scope)} ${tail}`).bind(since, ...scope.params);
  const scopedNews = scope.condition ? ` AND ${scope.condition}` : '';

  const [totals, daily, top, bySection, byAuthor, byType, byCountry, sources, published, pubDaily, dq, subs] = await Promise.all([
    base(`COUNT(*) AS views, COUNT(DISTINCT e.visitor_hash) AS visitors, SUM(e.visitor_hash IS NOT NULL) AS with_visitor, SUM(e.referrer IS NOT NULL) AS with_referrer, SUM(e.utm_medium IS NOT NULL OR e.utm_source IS NOT NULL) AS with_utm`).first(),
    base(`date(e.occurred_at) AS d, COUNT(*) AS v`, 'GROUP BY d ORDER BY d').all(),
    base(`n.id, n.slug, n.title, COUNT(*) AS views`, 'GROUP BY n.id ORDER BY views DESC, n.id DESC LIMIT 10').all(),
    db.prepare(`SELECT s.id, s.name, s.slug, COUNT(*) AS views FROM analytics_events e JOIN news n ON n.id = e.news_id LEFT JOIN news_sections s ON s.id = n.section_id WHERE ${eventWhere(scope)} GROUP BY s.id ORDER BY views DESC LIMIT 15`).bind(since, ...scope.params).all(),
    db.prepare(`SELECT a.id, a.name, COUNT(*) AS views FROM analytics_events e JOIN news n ON n.id = e.news_id LEFT JOIN authors a ON a.id = n.author_id WHERE ${eventWhere(scope)} GROUP BY a.id ORDER BY views DESC LIMIT 15`).bind(since, ...scope.params).all(),
    base(`COALESCE(n.article_type, 'news') AS type, COUNT(*) AS views`, 'GROUP BY type ORDER BY views DESC').all(),
    db.prepare(`SELECT e.country_code AS code, c.name, COUNT(*) AS views FROM analytics_events e JOIN news n ON n.id = e.news_id LEFT JOIN countries c ON c.code = e.country_code WHERE ${eventWhere(scope)} GROUP BY e.country_code ORDER BY views DESC LIMIT 15`).bind(since, ...scope.params).all(),
    base(`e.referrer, e.utm_medium, e.utm_source, COUNT(*) AS views`, 'GROUP BY e.referrer, e.utm_medium, e.utm_source ORDER BY views DESC LIMIT 500').all(),
    db.prepare(`SELECT COUNT(*) AS c FROM news n WHERE n.published = 1 AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now')) AND datetime(COALESCE(n.published_at, n.created_at)) >= datetime('now', ?)${scopedNews}`).bind(since, ...scope.params).first(),
    db.prepare(`SELECT date(COALESCE(n.published_at, n.created_at)) AS d, COUNT(*) AS c FROM news n WHERE n.published = 1 AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now')) AND datetime(COALESCE(n.published_at, n.created_at)) >= datetime('now', ?)${scopedNews} GROUP BY d ORDER BY d`).bind(since, ...scope.params).all(),
    db.prepare(`SELECT SUM(e.is_bot = 1) AS bots, SUM(e.is_duplicate = 1) AS dups, COUNT(*) AS total FROM analytics_events e JOIN news n ON n.id = e.news_id WHERE e.event_type IN ${VIEW_TYPES} AND e.occurred_at >= datetime('now', ?)${scopedNews}`).bind(since, ...scope.params).first(),
    scope.unrestricted ? db.prepare(`SELECT COUNT(*) AS signups, SUM(confirmed_at IS NOT NULL AND confirmed_at >= datetime('now', ?)) AS confirmed FROM newsletter_subscribers WHERE subscribed_at >= datetime('now', ?)`).bind(since, since).first().catch(() => null) : Promise.resolve(null)
  ]);

  const channels = {};
  const hostTotals = new Map();
  for (const r of sources.results || []) {
    const c = classifyTraffic({ referrer: r.referrer, utmMedium: r.utm_medium, utmSource: r.utm_source, siteHost });
    channels[c.channel] = (channels[c.channel] || 0) + r.views;
    if (c.host && (c.channel === 'referral' || c.channel === 'social' || c.channel === 'search')) hostTotals.set(c.host, (hostTotals.get(c.host) || 0) + r.views);
  }
  const views = totals?.views || 0;
  const withVisitor = totals?.with_visitor || 0;
  const result = {
    days, generated_at: new Date().toISOString(),
    articles_published: published?.c || 0,
    views,
    views_per_article: published?.c ? Math.round((views / published.c) * 10) / 10 : null,
    unique_visitors: { available: withVisitor > 0, value: withVisitor > 0 ? totals.visitors : null },
    daily_views: (daily.results || []).map((r) => ({ date: r.d, views: r.v })),
    publication_frequency: (pubDaily.results || []).map((r) => ({ date: r.d, articles: r.c })),
    top_articles: (top.results || []).map((r) => ({ id: r.id, slug: r.slug, title: r.title, views: r.views })),
    by_section: (bySection.results || []).map((r) => ({ id: r.id, name: r.name || 'No section', slug: r.slug, views: r.views })).sort(byViews('name')),
    by_author: (byAuthor.results || []).map((r) => ({ id: r.id, name: r.name || 'No author', views: r.views })).sort(byViews('name')),
    by_article_type: (byType.results || []).map((r) => ({ type: r.type, views: r.views })).sort(byViews('type')),
    by_country: (byCountry.results || []).map((r) => ({ code: r.code || null, name: r.name || r.code || 'Unknown', views: r.views })).sort(byViews('name')),
    traffic_sources: Object.entries(channels).map(([channel, v]) => ({ channel, views: v })).sort(byViews('channel')),
    top_referrers: [...hostTotals.entries()].map(([host, v]) => ({ host, views: v })).sort(byViews('host')).slice(0, 10),
    organic_search_views: channels.search || 0,
    newsletter: subs ? { site_wide_signups: subs.signups || 0, site_wide_confirmed: subs.confirmed || 0, article_attribution: false } : { available: false },
    engagement: { available: false, note: 'Scroll depth, reading time and link-click events are not recorded.' },
    data_quality: {
      bot_events_excluded: dq?.bots || 0, duplicate_events_excluded: dq?.dups || 0, events_total: dq?.total || 0,
      referrer_coverage: views ? Math.round(((totals.with_referrer || 0) / views) * 100) : null,
      utm_coverage: views ? Math.round(((totals.with_utm || 0) / views) * 100) : null,
      visitor_tracking: withVisitor > 0,
      bot_detection_recorded: (dq?.bots || 0) > 0,
      notes: [
        ...(withVisitor > 0 ? [] : ['Unique visitors are not available: page views are recorded without a visitor identifier.']),
        ...((dq?.bots || 0) > 0 ? [] : ['No page view has ever been flagged as a bot, so crawler traffic is probably included in these counts. Enable the news_analytics_enrichment flag to record a bot flag from now on.']),
        ...(views && (totals.with_referrer || 0) / views < 0.2 ? ['Fewer than 20% of page views carry a referrer, so most traffic shows as direct.'] : [])
      ]
    }
  };
  if (scope.unrestricted) await setCached(env, key, result, CACHE_TTL);
  return { ok: true, ...result };
}

// ── one article ──────────────────────────────────────────────
export async function getArticlePerformance(db, newsId, { days = 30, siteHost = '' } = {}) {
  if (!RANGES[days]) return { ok: false, status: 400, error: 'days must be 7, 30 or 90' };
  const since = sinceParam(days);
  const w = `e.news_id = ? AND e.event_type IN ${VIEW_TYPES} AND e.is_bot = 0 AND e.is_duplicate = 0 AND e.occurred_at >= datetime('now', ?)`;
  const q = (select, tail = '') => db.prepare(`SELECT ${select} FROM analytics_events e WHERE ${w} ${tail}`).bind(newsId, since);
  const [totals, daily, countries, sources, allTime] = await Promise.all([
    q(`COUNT(*) AS views, COUNT(DISTINCT e.visitor_hash) AS visitors, SUM(e.visitor_hash IS NOT NULL) AS with_visitor`).first(),
    q(`date(e.occurred_at) AS d, COUNT(*) AS v`, 'GROUP BY d ORDER BY d').all(),
    db.prepare(`SELECT e.country_code AS code, c.name, COUNT(*) AS views FROM analytics_events e LEFT JOIN countries c ON c.code = e.country_code WHERE ${w} GROUP BY e.country_code ORDER BY views DESC LIMIT 10`).bind(newsId, since).all(),
    q(`e.referrer, e.utm_medium, e.utm_source, COUNT(*) AS views`, 'GROUP BY e.referrer, e.utm_medium, e.utm_source ORDER BY views DESC LIMIT 300').all(),
    db.prepare(`SELECT COUNT(*) AS v FROM analytics_events e WHERE e.news_id = ? AND e.event_type IN ${VIEW_TYPES} AND e.is_bot = 0 AND e.is_duplicate = 0`).bind(newsId).first()
  ]);
  const channels = {}, hosts = new Map(); let fromNews = 0;
  for (const r of sources.results || []) {
    const c = classifyTraffic({ referrer: r.referrer, utmMedium: r.utm_medium, utmSource: r.utm_source, siteHost });
    channels[c.channel] = (channels[c.channel] || 0) + r.views;
    if (c.host && c.channel !== 'internal') hosts.set(c.host, (hosts.get(c.host) || 0) + r.views);
    if (c.channel === 'internal' && /\/en\/news\//.test(String(r.referrer))) fromNews += r.views;
  }
  const withVisitor = totals?.with_visitor || 0;
  return {
    ok: true, days, views: totals?.views || 0, views_all_time: allTime?.v || 0,
    unique_readers: { available: withVisitor > 0, value: withVisitor > 0 ? totals.visitors : null },
    daily_views: (daily.results || []).map((r) => ({ date: r.d, views: r.v })),
    countries: (countries.results || []).map((r) => ({ code: r.code || null, name: r.name || r.code || 'Unknown', views: r.views })).sort(byViews('name')),
    traffic_sources: Object.entries(channels).map(([channel, v]) => ({ channel, views: v })).sort(byViews('channel')),
    referral_sources: [...hosts.entries()].map(([host, v]) => ({ host, views: v })).sort(byViews('host')).slice(0, 10),
    search_views: channels.search || 0, newsletter_views: channels.newsletter || 0,
    views_from_other_news_articles: fromNews,     // proxy for related-story / in-text link clicks (no click events exist)
    engagement: { available: false }
  };
}
