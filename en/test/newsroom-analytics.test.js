// test/newsroom-analytics.test.js -- Stage J: newsroom analytics (overview, per-article, enrichment).
// Real analytics tables + real controllers; SQLite, not D1.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderNews } from '../worker/controllers.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import { setUserItemAccess } from '../worker/database/item-access.js';
import * as A from '../worker/newsroom-analytics.js';
import * as S from '../worker/newsroom-stats.js';
import * as nr from '../worker/database/newsroom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
const ADMIN = { user_id: 1, role: 'admin' }, EDITOR = { user_id: 2, role: 'editor' };

async function mkEnv({ cache = false } = {}) {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin'),(2,'e@t.l','x','editor')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name) VALUES (1,'jane','Jane'),(2,'sam','Sam')`).run();
  await db.prepare(`INSERT INTO countries (code,name) VALUES ('GB','United Kingdom'),('DE','Germany')`).run();
  const env = { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
  if (cache) { const kv = new Map(); env.CACHE = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } }; env._kv = kv; }
  return env;
}
let seq = 700;
const art = async (env, o = {}) => {
  const id = o.id ?? ++seq;
  await env.DB.prepare(`INSERT INTO news (id,slug,title,content,published,published_at,created_at,author_id,created_by,excerpt,section_id,article_type) VALUES (?,?,?,?,?,?,?,?,?,'ex',?,?)`)
    .bind(id, o.slug ?? `a-${id}`, o.title ?? `Title ${id}`, '<p>x</p>', o.published ?? 1, o.published_at ?? null, o.created_at ?? ago(o.age ?? 24), o.author ?? 1, o.owner ?? 1, o.section ?? null, o.type ?? null).run();
  return id;
};
const ev = (env, news, o = {}) => Promise.all(Array.from({ length: o.n ?? 1 }, () => env.DB.prepare(
  `INSERT INTO analytics_events (event_type, news_id, occurred_at, country_code, referrer, utm_medium, utm_source, visitor_hash, is_bot, is_duplicate) VALUES (?,?,?,?,?,?,?,?,?,?)`)
  .bind(o.type ?? 'CONTENT_VIEW', news, o.at ?? ago(1), o.country ?? null, o.referrer ?? null, o.utm_medium ?? null, o.utm_source ?? null, o.visitor ?? null, o.bot ? 1 : 0, o.dup ? 1 : 0).run()));
const overview = async (env, user = ADMIN, days = 30) => A.getOverview(env.DB, env, user, { days, siteHost: 'site.test' });

describe('classifiers', () => {
  test('bot user agents (and an empty UA) are bots; real browsers are not', () => {
    for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'Slackbot-LinkExpanding 1.0', 'facebookexternalhit/1.1', 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120', 'Chrome-Lighthouse', 'curl/8.4.0', 'python-requests/2.31', 'Wget/1.21', 'Twitterbot/1.0', 'AhrefsBot/7.0', ''])
      assert.equal(A.isBotUserAgent(ua), true, ua || '(empty)');
    for (const ua of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/121.0'])
      assert.equal(A.isBotUserAgent(ua), false, ua);
  });
  test('device classes', () => {
    assert.equal(A.deviceTypeFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1'), 'mobile');
    assert.equal(A.deviceTypeFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1'), 'tablet');
    assert.equal(A.deviceTypeFromUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) Chrome/120 Mobile Safari/537.36'), 'mobile');
    assert.equal(A.deviceTypeFromUserAgent('Mozilla/5.0 (Linux; Android 13; SM-X700) Chrome/120 Safari/537.36'), 'tablet');
    assert.equal(A.deviceTypeFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36'), 'desktop');
    assert.equal(A.deviceTypeFromUserAgent('Googlebot/2.1'), 'bot'); assert.equal(A.deviceTypeFromUserAgent(''), 'unknown');
  });
  test('UTM parsing is clipped and tolerant', () => {
    assert.deepEqual(A.parseUtm('https://site.test/en/news/x?utm_source=nl&utm_medium=email&utm_campaign=' + 'c'.repeat(300)).utmMedium, 'email');
    assert.equal(A.parseUtm('https://site.test/en/news/x?utm_campaign=' + 'c'.repeat(300)).utmCampaign.length, 120);
    assert.deepEqual(A.parseUtm('not a url'), {}); assert.equal(A.parseUtm('https://site.test/x').utmSource, null);
  });
  test('traffic channels, including spoofed hosts and own-site referrers', () => {
    const c = (referrer, extra = {}) => A.classifyTraffic({ referrer, siteHost: 'site.test', ...extra }).channel;
    assert.equal(c(null), 'direct'); assert.equal(c(''), 'direct'); assert.equal(c('garbage'), 'direct');
    assert.equal(c('https://site.test/en/news/other'), 'internal'); assert.equal(c('https://www.site.test/'), 'internal'); assert.equal(c('https://m.site.test/x'), 'internal');
    for (const r of ['https://www.google.com/', 'https://www.google.co.uk/search?q=x', 'https://www.bing.com/', 'https://duckduckgo.com/', 'https://search.yahoo.com/', 'https://yandex.ru/']) assert.equal(c(r), 'search', r);
    for (const r of ['https://l.facebook.com/l.php', 'https://t.co/abc', 'https://www.linkedin.com/feed', 'https://lnkd.in/x', 'https://www.reddit.com/r/x', 'https://www.youtube.com/watch']) assert.equal(c(r), 'social', r);
    for (const r of ['https://google.evil.com/', 'https://facebook.evil.com/', 'https://notgoogle.com/', 'https://example.org/post']) assert.equal(c(r), 'referral', r);
    assert.equal(c('https://www.google.com/', { utmMedium: 'email' }), 'newsletter'); assert.equal(c(null, { utmSource: 'Weekly-Newsletter' }), 'newsletter');
    assert.equal(c('https://www.google.com/', { utmMedium: 'cpc' }), 'paid');
  });
});

describe('overview', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });

  test('counts only real reader views of news: excludes bots, duplicates, other event types, old events, deleted articles', async () => {
    const a = await art(env), b = await art(env);
    await ev(env, a, { n: 3 }); await ev(env, a, { n: 2, type: 'PAGE_VIEW' }); await ev(env, b, { n: 1 });
    await ev(env, a, { n: 9, bot: true }); await ev(env, a, { n: 9, dup: true }); await ev(env, a, { n: 9, type: 'CASINO_VIEW' }); await ev(env, a, { n: 9, at: ago(24 * 40) });
    env.DB._raw.exec('PRAGMA foreign_keys = OFF');                               // orphan events (article deleted later) must not count
    await ev(env, 999999, { n: 9 });
    env.DB._raw.exec('PRAGMA foreign_keys = ON');
    const o = await overview(env);
    assert.equal(o.ok, true); assert.equal(o.views, 6);
    assert.equal(o.daily_views.reduce((s, d) => s + d.views, 0), 6);
    assert.deepEqual(o.top_articles.map((t) => [t.id, t.views]), [[a, 5], [b, 1]]);
    assert.equal(o.data_quality.bot_events_excluded, 9);
    assert.equal((await overview(env, ADMIN, 7)).views, 6);
    assert.equal((await overview(env, ADMIN, 90)).views, 15, 'the 40-day-old events (9) join in at 90 days; orphans never count');
  });

  test('window validation and 90-day inclusion of older events', async () => {
    const a = await art(env); await ev(env, a, { n: 2, at: ago(24 * 40) }); await ev(env, a, { n: 1 });
    assert.equal((await overview(env, ADMIN, 30)).views, 1); assert.equal((await overview(env, ADMIN, 90)).views, 3);
    const bad = await overview(env, ADMIN, 5); assert.equal(bad.ok, false); assert.equal(bad.status, 400);
  });

  test('breakdowns: section (null => "No section"), author, article type default, countries with names, ordered by views', async () => {
    const sec = (await env.DB.prepare(`SELECT id FROM news_sections WHERE slug='regulation'`).first()).id;
    const a = await art(env, { section: sec, author: 1, type: 'analysis' }), b = await art(env, { author: 2 });
    await ev(env, a, { n: 4, country: 'GB' }); await ev(env, b, { n: 2, country: 'DE' }); await ev(env, b, { n: 1, country: 'ZZ' }); await ev(env, b, { n: 1 });
    const o = await overview(env);
    assert.deepEqual(o.by_section.map((s) => [s.name, s.views]), [['No section', 4], ['Regulation', 4]], 'ties are broken alphabetically, deterministically');
    assert.deepEqual(o.by_author.map((s) => [s.name, s.views]), [['Jane', 4], ['Sam', 4]]);
    assert.deepEqual(o.by_article_type.map((s) => [s.type, s.views]), [['analysis', 4], ['news', 4]]);
    assert.deepEqual(o.by_country.slice(0, 2).map((c) => [c.name, c.views]), [['United Kingdom', 4], ['Germany', 2]]);
    assert.ok(o.by_country.some((c) => c.code === 'ZZ' && c.name === 'ZZ'), 'unknown code falls back to the code');
    assert.ok(o.by_country.some((c) => c.code === null && c.name === 'Unknown'));
  });

  test('traffic sources sum to total views; organic search, referrers and internal traffic are separated', async () => {
    const a = await art(env);
    await ev(env, a, { n: 5 });                                                            // direct
    await ev(env, a, { n: 3, referrer: 'https://www.google.com/' }); await ev(env, a, { n: 2, referrer: 'https://l.facebook.com/l.php' });
    await ev(env, a, { n: 2, referrer: 'https://blog.example.org/post' }); await ev(env, a, { n: 1, referrer: 'https://blog.example.org/other' });
    await ev(env, a, { n: 4, referrer: 'https://site.test/en/news/x' }); await ev(env, a, { n: 2, utm_medium: 'email', referrer: 'https://mail.example.com/' });
    const o = await overview(env);
    const by = Object.fromEntries(o.traffic_sources.map((s) => [s.channel, s.views]));
    assert.deepEqual(by, { direct: 5, internal: 4, search: 3, referral: 3, social: 2, newsletter: 2 });
    assert.equal(o.traffic_sources.reduce((s, x) => s + x.views, 0), o.views);
    assert.equal(o.organic_search_views, 3);
    assert.deepEqual(o.top_referrers[0], { host: 'blog.example.org', views: 3 });
    assert.ok(!o.top_referrers.some((r) => r.host === 'site.test'));
  });

  test('unique visitors are reported only when a visitor identifier exists; otherwise "not available", never a guess', async () => {
    const a = await art(env); await ev(env, a, { n: 3 });
    assert.deepEqual((await overview(env)).unique_visitors, { available: false, value: null });
    await ev(env, a, { n: 2, visitor: 'v1' }); await ev(env, a, { n: 1, visitor: 'v2' });
    assert.deepEqual((await overview(env)).unique_visitors, { available: true, value: 2 });
  });

  test('data-quality notes tell the truth about what is missing', async () => {
    const a = await art(env); await ev(env, a, { n: 10 });
    let dq = (await overview(env)).data_quality;
    assert.equal(dq.visitor_tracking, false); assert.equal(dq.referrer_coverage, 0);
    assert.ok(dq.notes.some((n) => /Unique visitors are not available/.test(n)));
    assert.ok(dq.notes.some((n) => /bot/.test(n) && /crawler traffic is probably included/.test(n)));
    assert.ok(dq.notes.some((n) => /Fewer than 20%/.test(n)));
    await ev(env, a, { n: 1, bot: true }); await ev(env, a, { n: 10, visitor: 'v', referrer: 'https://www.google.com/' });
    dq = (await overview(env)).data_quality;
    assert.ok(!dq.notes.some((n) => /crawler traffic is probably included/.test(n)));
    assert.ok(!dq.notes.some((n) => /Unique visitors are not available/.test(n)));
    assert.equal(dq.bot_detection_recorded, true);
  });

  test('publication counts and frequency: live articles in the window only', async () => {
    await art(env, { age: 24 }); await art(env, { age: 30 }); await art(env, { age: 24 * 45 });
    await art(env, { published: 0 }); await art(env, { published_at: '2099-01-01 00:00:00' });
    const o = await overview(env);
    assert.equal(o.articles_published, 2); assert.equal(o.publication_frequency.reduce((s, d) => s + d.articles, 0), 2);
    assert.equal((await overview(env, ADMIN, 90)).articles_published, 3);
    assert.equal(o.views_per_article, 0);
  });

  test('newsletter: site-wide signups only, explicitly not attributed to articles', async () => {
    await env.DB.prepare(`INSERT INTO newsletter_subscribers (email, token, status, subscribed_at, confirmed_at) VALUES ('a@x.y','t1','confirmed',?,?),('b@x.y','t2','pending',?,NULL),('c@x.y','t3','confirmed',?,?)`).bind(ago(5), ago(4), ago(3), ago(24 * 60), ago(24 * 60)).run();
    const o = await overview(env);
    assert.deepEqual(o.newsletter, { site_wide_signups: 2, site_wide_confirmed: 1, article_attribution: false });
    assert.equal(o.engagement.available, false);
  });

  test('cache: unrestricted callers are cached per period; a scoped caller is neither served from nor written to it', async () => {
    const e2 = await mkEnv({ cache: true });
    const mine = await art(e2, { owner: 2 }), theirs = await art(e2, { owner: 1 });
    await ev(e2, mine, { n: 2 }); await ev(e2, theirs, { n: 5 });
    assert.equal((await overview(e2)).views, 7); assert.ok([...e2._kv.keys()].some((k) => k.includes('analytics:overview:30')));
    await e2.DB.prepare(`DELETE FROM analytics_events`).run();
    const again = await overview(e2); assert.equal(again.views, 7); assert.equal(again.cached, true);
    assert.equal((await overview(e2, ADMIN, 7)).views, 0, 'a different period is a different cache entry');
    await setUserItemAccess(e2.DB, 2, 'news', 'read', 'own');
    assert.equal((await overview(e2, EDITOR)).views, 0);
    assert.equal((await overview(e2, ADMIN)).views, 7, 'the scoped result never leaks into the shared cache entry');
  });

  test('item-level access: a user limited to their own articles only sees those, and no site-wide newsletter data', async () => {
    const mine = await art(env, { owner: 2 }), theirs = await art(env, { owner: 1 });
    await ev(env, mine, { n: 2, country: 'GB' }); await ev(env, theirs, { n: 5, country: 'DE' });
    await setUserItemAccess(env.DB, 2, 'news', 'read', 'own');
    const o = await overview(env, EDITOR);
    assert.equal(o.views, 2); assert.deepEqual(o.top_articles.map((t) => t.id), [mine]); assert.deepEqual(o.by_country.map((c) => c.code), ['GB']);
    assert.equal(o.articles_published, 1); assert.deepEqual(o.newsletter, { available: false });
    assert.equal((await overview(env, ADMIN)).views, 7);
  });
});

describe('per-article performance', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });
  test('views, sources, search/newsletter, countries and views arriving from other news articles', async () => {
    const a = await art(env), other = await art(env);
    await ev(env, a, { n: 4, country: 'GB' }); await ev(env, a, { n: 3, referrer: 'https://www.google.com/', country: 'DE' }); await ev(env, a, { n: 2, utm_medium: 'email' });
    await ev(env, a, { n: 5, referrer: 'https://site.test/en/news/other-article' }); await ev(env, a, { n: 1, referrer: 'https://site.test/en/casinos' });
    await ev(env, a, { n: 6, bot: true }); await ev(env, a, { n: 7, at: ago(24 * 60) }); await ev(env, other, { n: 50 });
    const r = await A.getArticlePerformance(env.DB, a, { days: 30, siteHost: 'site.test' });
    assert.equal(r.views, 15); assert.equal(r.views_all_time, 22);
    assert.equal(r.search_views, 3); assert.equal(r.newsletter_views, 2); assert.equal(r.views_from_other_news_articles, 5);
    const cm = Object.fromEntries(r.countries.map((c) => [c.name, c.views]));
    assert.equal(cm['United Kingdom'], 4); assert.equal(cm.Germany, 3); assert.equal(cm.Unknown, 8);
    assert.equal(r.traffic_sources.reduce((s, x) => s + x.views, 0), 15);
    assert.equal(r.unique_readers.available, false); assert.equal(r.engagement.available, false);
    assert.equal((await A.getArticlePerformance(env.DB, a, { days: 3 })).ok, false);
  });
  test('the query uses the new news_id index (migration 0057), not a scan of all events', async () => {
    const plan = (await env.DB.prepare(`EXPLAIN QUERY PLAN SELECT COUNT(*) FROM analytics_events e WHERE e.news_id = ? AND e.event_type IN ('PAGE_VIEW','CONTENT_VIEW') AND e.is_bot = 0 AND e.is_duplicate = 0 AND e.occurred_at >= datetime('now', ?)`).bind(1, '-30 day').all()).results.map((r) => r.detail).join(' | ');
    assert.match(plan, /idx_analytics_events_news/);
    assert.equal((await env.DB.prepare(`SELECT value FROM system_settings WHERE key='news_analytics_enrichment'`).first()).value, 'false');
  });
});

describe('analytics API', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });
  const call = async (route, user) => { const r = await handleNewsroomApi(new Request(`https://site.test/api/v1/newsroom/${route}`), env, user); return { status: r.status, json: await r.json(), cc: r.headers.get('Cache-Control') }; };
  test('needs news.view_analytics (admin-only by default); validates period; per-article respects item access', async () => {
    const a = await art(env, { owner: 1 }); await ev(env, a, { n: 2 });
    assert.equal((await call('analytics/overview', EDITOR)).status, 403);
    assert.equal((await call(`analytics/article?id=${a}`, EDITOR)).status, 403);
    const o = await call('analytics/overview?days=30', ADMIN);
    assert.equal(o.status, 200); assert.equal(o.json.views, 2); assert.equal(o.cc, 'no-store'); assert.ok(Array.isArray(o.json.trending));
    assert.equal((await call('analytics/overview?days=5', ADMIN)).status, 400);
    assert.equal((await call('analytics/overview?days=abc', ADMIN)).status, 400);
    assert.equal((await call(`analytics/article?id=${a}&days=7`, ADMIN)).json.views, 2);
    assert.equal((await call(`analytics/article?id=999999`, ADMIN)).status, 404);
    // grant the permission to editors, then scope them to their own articles
    await env.DB.prepare(`INSERT INTO permissions (role, resource, action, allowed) VALUES ('editor','news','view_analytics',1) ON CONFLICT(role,resource,action) DO UPDATE SET allowed=1`).run();
    await setUserItemAccess(env.DB, 2, 'news', 'read', 'own');
    assert.equal((await call(`analytics/article?id=${a}`, EDITOR)).status, 404, 'not their article');
    assert.equal((await call('analytics/overview', EDITOR)).json.views, 0);
  });
});

describe('view logging enrichment (flag news_analytics_enrichment)', () => {
  let env, pending; beforeEach(async () => { env = await mkEnv(); pending = []; await art(env, { slug: 'story' }); });
  const view = async (ua, qs = '', referer = '') => {
    const headers = { 'user-agent': ua }; if (referer) headers.referer = referer;
    await renderNews(new Request(`https://site.test/en/news/story${qs}`, { headers }), env, 'story', { waitUntil: (p) => pending.push(p) });
    await Promise.all(pending); pending = [];
    return env.DB.prepare(`SELECT is_bot, device_type, utm_source, utm_medium, utm_campaign, referrer FROM analytics_events ORDER BY id DESC LIMIT 1`).first();
  };
  const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

  test('flag OFF: the event is exactly what it always was (no bot flag, device or UTM)', async () => {
    const r = await view('Googlebot/2.1', '?utm_source=nl&utm_medium=email', 'https://www.google.com/');
    assert.deepEqual({ ...r }, { is_bot: 0, device_type: null, utm_source: null, utm_medium: null, utm_campaign: null, referrer: 'https://www.google.com/' });
  });
  test('flag ON: crawlers are flagged (and drop out of every count), devices and UTMs are recorded', async () => {
    await env.DB.prepare(`UPDATE system_settings SET value='true' WHERE key='news_analytics_enrichment'`).run(); nr.resetNewsFlagCache();
    assert.equal((await view('Googlebot/2.1')).is_bot, 1);
    assert.equal((await view(CHROME)).device_type, 'desktop');
    const m = await view(IPHONE, '?utm_source=weekly&utm_medium=email&utm_campaign=sep', 'https://mail.example.com/');
    assert.deepEqual({ ...m }, { is_bot: 0, device_type: 'mobile', utm_source: 'weekly', utm_medium: 'email', utm_campaign: 'sep', referrer: 'https://mail.example.com/' });
    const o = await overview(env);
    assert.equal(o.views, 2, 'the bot view is excluded'); assert.equal(o.data_quality.bot_events_excluded, 1);
    assert.equal(o.traffic_sources.find((s) => s.channel === 'newsletter').views, 1);
    assert.equal((await S.getMostRead(env.DB, env, '24h', 5))[0].views, 2);
  });
});
