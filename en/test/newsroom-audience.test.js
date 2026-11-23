// test/newsroom-audience.test.js -- RSS feeds, cookie consent, share bar, lazy images, footer trust links, copyright reports.
// Real migrated schema, real controllers and templates. Not covered: real feed readers, real browsers, Google consent mode in a live tag.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderNews } from '../worker/controllers.js';
import { renderCopyrightReport } from '../worker/news-report-page.js';
import { handleNewsFeed, withFeedLink, buildFeedXml } from '../worker/news-feed.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import * as aud from '../worker/newsroom-audience.js';
import { getRoute } from '../worker/routes.js';
import { buildGaScript, buildConsentHtml } from '../worker/site-settings/analytics.js';
import { resetNewsFlagCache } from '../worker/database/newsroom.js';
import { getSiteContext } from '../worker/site-context.js';
import { TRUST_PAGES } from '../worker/newsroom-trust.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://news.example.com';
const ADMIN = { user_id: 1, role: 'admin' };

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,role) VALUES (1,'elie','Elie','Editor')`).run();
  const ins = `INSERT INTO news (id,slug,title,content,published,published_at,author_id,created_by,excerpt) VALUES (?,?,?,?,?,?,1,1,?)`;
  await db.prepare(ins).bind(10, 'live-one', 'Live & One', '<p>Body <img src="/a.png"> <img src="/b.png" loading="eager"> text</p>', 1, '2026-02-01 10:00:00', 'Summary <b>one</b>').run();
  await db.prepare(ins).bind(11, 'future-one', 'Future', '<p>f</p>', 1, '2099-01-01 00:00:00', 'f').run();
  await db.prepare(ins).bind(12, 'draft-one', 'Draft', '<p>d</p>', 0, null, 'd').run();
  const env = { DB: db, ASSETS: { fetch: async (req) => { const f = join(ROOT, new URL(req.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8'), { status: 200 }) : new Response('nf', { status: 404 }); } } };
  resetNewsFlagCache(); aud.forgetAudienceFlags(db); aud.forgetFooterTrust(db);
  return env;
}
const flag = async (env, key, value = 'true') => { await env.DB.prepare(`INSERT INTO system_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(key, value).run(); resetNewsFlagCache(); aud.forgetAudienceFlags(env.DB); aud.forgetFooterTrust(env.DB); };
const feed = async (env, path, headers = {}) => { const req = new Request(BASE + path, { headers }); const route = getRoute(req); return { route, res: await handleNewsFeed(req, env, route, { getSite: getSiteContext }) }; };
const page = async (env, slug) => { const res = await renderNews(new Request(`${BASE}/en/news/${slug}`), env, slug, null); return res.text(); };
const goodReport = (extra = {}) => ({ page_url: `${BASE}/en/news/live-one`, reporter_name: 'Ana Photographer', reporter_email: 'ana@example.org', original_work: 'https://ana.example.org/photo', details: 'The photograph at the top is mine and was used without a licence.', good_faith: true, accuracy_confirmed: true, signature: 'Ana Photographer', ...extra });

describe('migration', () => {
  test('five switches ship off and the reports table exists', async () => {
    const env = await mkEnv();
    for (const k of ['news_rss_feeds', 'news_rss_full_text', 'news_share_bar', 'news_trust_footer_links', 'news_copyright_reports']) {
      assert.equal((await env.DB.prepare(`SELECT value FROM system_settings WHERE key=?`).bind(k).first()).value, 'false', k);
    }
    assert.ok(await env.DB.prepare(`SELECT name FROM sqlite_master WHERE name='news_copyright_reports'`).first());
  });
});

describe('RSS feeds', () => {
  test('routes resolve to the feed type', () => {
    const r = (p) => getRoute(new Request(BASE + p));
    assert.deepEqual([r('/en/news/feed.xml').type, r('/en/news/feed.xml').scope], ['newsFeed', 'all']);
    assert.equal(r('/en/feed.xml').scope, 'all');
    assert.deepEqual(r('/en/news/topic/ai/feed.xml'), { type: 'newsFeed', scope: 'topic', slug: 'ai' });
    assert.deepEqual(r('/en/news/markets/feed.xml'), { type: 'newsFeed', scope: 'section', slug: 'markets' });
    assert.deepEqual(r('/en/author/elie/feed.xml'), { type: 'newsFeed', scope: 'author', slug: 'elie' });
    assert.equal(r('/en/news/some-story').type, 'news', 'article URLs are untouched');
  });
  test('off by default: 404', async () => {
    const env = await mkEnv();
    assert.equal((await feed(env, '/en/news/feed.xml')).res.status, 404);
  });
  test('on: live articles only, summary text, escaped, cacheable', async () => {
    const env = await mkEnv(); await flag(env, 'news_rss_feeds');
    const { res } = await feed(env, '/en/news/feed.xml');
    assert.equal(res.status, 200); assert.match(res.headers.get('Content-Type'), /rss\+xml/);
    const xml = await res.text();
    assert.ok(xml.includes('<title>Live &amp; One</title>'));
    assert.ok(xml.includes(`<link>${BASE}/en/news/live-one</link>`));
    assert.ok(xml.includes('<dc:creator>Elie</dc:creator>'));
    assert.ok(!xml.includes('Future') && !xml.includes('Draft'), 'scheduled and draft stories stay out');
    assert.ok(!xml.includes('<content:encoded>'), 'summary only by default');
    assert.ok(xml.includes('Summary one'), 'tags stripped from the summary');
    const etag = res.headers.get('ETag');
    assert.equal((await feed(env, '/en/news/feed.xml', { 'If-None-Match': etag })).res.status, 304);
  });
  test('the full-text switch adds the whole article', async () => {
    const env = await mkEnv(); await flag(env, 'news_rss_feeds'); await flag(env, 'news_rss_full_text');
    const xml = await (await feed(env, '/en/news/feed.xml')).res.text();
    assert.ok(xml.includes('<content:encoded><![CDATA[<p>Body'));
  });
  test('author feed works; unknown author and section feeds are 404; section feeds need the sections switch', async () => {
    const env = await mkEnv(); await flag(env, 'news_rss_feeds');
    assert.equal((await feed(env, '/en/author/elie/feed.xml')).res.status, 200);
    assert.equal((await feed(env, '/en/author/nobody/feed.xml')).res.status, 404);
    await env.DB.prepare(`INSERT INTO news_sections (id,slug,name,active) VALUES (900,'desk','Desk',1)`).run();
    await env.DB.prepare(`UPDATE news SET section_id=900 WHERE id=10`).run();
    assert.equal((await feed(env, '/en/news/desk/feed.xml')).res.status, 404, 'sections switch off');
    await flag(env, 'news_new_taxonomy');
    const r = await feed(env, '/en/news/desk/feed.xml');
    assert.equal(r.res.status, 200); assert.ok((await r.res.text()).includes('Live &amp; One'));
  });
  test('CDATA end markers in text cannot break the XML', () => {
    const xml = buildFeedXml({ origin: BASE, siteName: 'S', feedPath: '/f', link: BASE, full: true, rows: [{ slug: 'a', title: 'T', content: '<p>x ]]> y</p>', published_at: '2026-01-01 00:00:00' }] });
    assert.ok(!/<!\[CDATA\[[^\]]*\]\]>[^<]*\]\]>/.test(xml.replace(/\]\]\]\]><!\[CDATA\[>/g, '')));
  });
  test('the news list gets the feed link only when the switch is on', async () => {
    const env = await mkEnv();
    const mk = () => new Response('<html><head></head><body></body></html>', { headers: { 'Content-Type': 'text/html' } });
    assert.ok(!(await (await withFeedLink(mk(), null, env)).text()).includes('rss+xml'));
    await flag(env, 'news_rss_feeds');
    assert.ok((await (await withFeedLink(mk(), null, env)).text()).includes('rel="alternate" type="application/rss+xml"'));
  });
});

describe('cookie consent', () => {
  const GA = { gaMeasurementId: 'G-ABCDEF1234' };
  test('banner off: the analytics snippet has no consent block (unchanged)', () => {
    const out = buildGaScript({ ...GA, cookieBannerMode: 'off' });
    assert.ok(!out.includes("'consent'")); assert.equal(out, buildGaScript(GA));
    assert.deepEqual(buildConsentHtml({ cookieBannerMode: 'off' }), { script: '', link: '' });
  });
  test('banner on: consent defaults to denied unless the cookie says granted, before the config call', () => {
    const out = buildGaScript({ ...GA, cookieBannerMode: 'on' });
    assert.ok(out.indexOf("gtag('consent','default'") < out.indexOf("gtag('config'"));
    assert.ok(out.includes('lm_consent'));
  });
  test('banner tag escapes the text and refuses unsafe policy links', () => {
    const c = buildConsentHtml({ cookieBannerMode: 'on', cookieBannerText: '"><script>x</script>', cookiePolicyUrl: 'javascript:alert(1)' });
    assert.ok(!c.script.includes('<script>x'));
    assert.ok(c.script.includes('data-policy=""'));
    assert.ok(buildConsentHtml({ cookieBannerMode: 'on', cookiePolicyUrl: '/en/privacy' }).script.includes('data-policy="/en/privacy"'));
    assert.ok(c.link.includes('data-cookie-settings'));
  });
  test('the banner script uses DOM calls only', () => {
    const js = readFileSync(join(ROOT, 'static/js/cookie-consent.js'), 'utf-8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js));
    assert.ok(js.includes('lm_consent') && js.includes('consent'));
  });
  test('the settings are in the manifest and the template', () => {
    const groups = readFileSync(join(ROOT, 'worker/site-profile/settings-groups.js'), 'utf-8');
    for (const k of ['cookie_banner_mode', 'cookie_banner_text', 'cookie_policy_url']) assert.ok(groups.includes(k), k);
    assert.ok(readFileSync(join(ROOT, 'templates/pages/admin/settings/analytics.html'), 'utf-8').includes('name="cookie_banner_mode"'));
  });
});

describe('share bar and lazy images', () => {
  test('off by default: the article page is unchanged', async () => {
    const env = await mkEnv();
    const html = await page(env, 'live-one');
    assert.ok(!html.includes('nr-share') && !html.includes('copyright-report'));
    assert.ok(html.includes('<img src="/a.png">'), 'article images are left exactly as written');
  });
  test('share bar on: links carry the encoded address and title; no tracking', async () => {
    const env = await mkEnv(); await flag(env, 'news_share_bar');
    const html = await page(env, 'live-one');
    assert.ok(html.includes('nr-share'));
    assert.ok(html.includes('wa.me/?text=Live%20%26%20One'));
    assert.ok(html.includes(encodeURIComponent(`${BASE}/en/news/live-one`)));
    assert.ok(html.includes('rel="noopener noreferrer nofollow"'));
  });
  test('lazy images adds loading only where it is missing', async () => {
    const env = await mkEnv(); await flag(env, 'news_lazy_images');
    const html = await page(env, 'live-one');
    assert.ok(html.includes('<img src="/a.png" loading="lazy" decoding="async">'));
    assert.ok(html.includes('<img src="/b.png" loading="eager">'), 'an explicit choice is kept');
    assert.equal(aud.lazyImages('<img src="x" decoding="sync">'), '<img src="x" decoding="sync" loading="lazy">');
  });
});

describe('footer trust links', () => {
  test('off: nothing. on: only published policy pages, plus the copyright link when that switch is on', async () => {
    const env = await mkEnv();
    assert.equal(await aud.loadFooterTrustHtml(env.DB), '');
    await flag(env, 'news_trust_footer_links');
    assert.equal(await aud.loadFooterTrustHtml(env.DB), '', 'no policy pages published yet');
    const t = TRUST_PAGES[1];
    await env.DB.prepare(`INSERT INTO pages (slug,type,template,title,content_json,published) VALUES (?,'page','page.html',?,?,1)`).bind(t.slug, t.title, '"<p>x</p>"').run();
    await env.DB.prepare(`INSERT INTO pages (slug,type,template,title,content_json,published) VALUES (?,'page','page.html',?,?,0)`).bind(TRUST_PAGES[2].slug, 'Hidden', '"<p>x</p>"').run();
    aud.forgetFooterTrust(env.DB);
    let html = await aud.loadFooterTrustHtml(env.DB);
    assert.ok(html.includes(`/en/${t.slug}`) && !html.includes('Hidden'));
    await flag(env, 'news_copyright_reports');
    html = await aud.loadFooterTrustHtml(env.DB);
    assert.ok(html.includes('/en/copyright-report'));
  });
});

describe('copyright reports', () => {
  test('off: the form and the API are 404', async () => {
    const env = await mkEnv();
    assert.equal((await aud.submitCopyrightReport(env, { body: goodReport(), ip: '1.1.1.1', origin: BASE })).status, 404);
    assert.equal((await renderCopyrightReport(new Request(`${BASE}/en/copyright-report`), env)).status, 404);
  });
  test('on: the page renders with the address pre-filled', async () => {
    const env = await mkEnv(); await flag(env, 'news_copyright_reports');
    const res = await renderCopyrightReport(new Request(`${BASE}/en/copyright-report?url=${encodeURIComponent(BASE + '/en/news/live-one')}`), env);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('Report a copyright issue') && html.includes(`value="${BASE}/en/news/live-one"`));
  });
  test('a valid report is stored and linked to the article; the reporter IP is stored only as a hash', async () => {
    const env = await mkEnv(); await flag(env, 'news_copyright_reports');
    const r = await aud.submitCopyrightReport(env, { body: goodReport(), ip: '9.9.9.9', origin: BASE });
    assert.equal(r.ok, true);
    const row = await env.DB.prepare(`SELECT * FROM news_copyright_reports`).first();
    assert.equal(row.news_id, 10); assert.equal(row.status, 'new'); assert.ok(!JSON.stringify(row).includes('9.9.9.9'));
  });
  test('invalid, off-site, incomplete and bot reports are refused or ignored', async () => {
    const env = await mkEnv(); await flag(env, 'news_copyright_reports');
    for (const bad of [{ reporter_email: 'nope' }, { good_faith: false }, { accuracy_confirmed: false }, { signature: '' }, { details: 'short' }, { page_url: 'https://other.example.net/en/news/x' }, { page_url: '' }]) {
      const r = await aud.submitCopyrightReport(env, { body: goodReport(bad), ip: '2.2.2.2', origin: BASE });
      assert.equal(r.ok, false, JSON.stringify(bad)); assert.equal(r.status, 400);
    }
    const bot = await aud.submitCopyrightReport(env, { body: goodReport({ website: 'http://spam' }), ip: '3.3.3.3', origin: BASE });
    assert.equal(bot.ok, true);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_copyright_reports`).first()).c, 0, 'nothing stored for those');
  });
  test('more than five reports an hour from one connection are limited', async () => {
    const env = await mkEnv(); await flag(env, 'news_copyright_reports');
    for (let i = 0; i < 5; i++) assert.equal((await aud.submitCopyrightReport(env, { body: goodReport(), ip: '4.4.4.4', origin: BASE })).ok, true);
    assert.equal((await aud.submitCopyrightReport(env, { body: goodReport(), ip: '4.4.4.4', origin: BASE })).status, 429);
    assert.equal((await aud.submitCopyrightReport(env, { body: goodReport(), ip: '5.5.5.5', origin: BASE })).ok, true);
  });
  test('editors list, move and action reports; taking the article offline is reversible and optional', async () => {
    const env = await mkEnv(); await flag(env, 'news_copyright_reports');
    await aud.submitCopyrightReport(env, { body: goodReport(), ip: '6.6.6.6', origin: BASE });
    const api = async (method, route, body) => {
      const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body);
      const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, ADMIN);
      return { status: res.status, json: await res.json() };
    };
    const list = await api('GET', 'copyright/list');
    assert.equal(list.json.reports.length, 1); assert.equal(list.json.counts.new, 1); assert.ok(!('ip_hash' in list.json.reports[0]));
    const id = list.json.reports[0].id;
    assert.equal((await api('POST', 'copyright/update', { id, status: 'reviewing' })).json.success, true);
    assert.equal((await env.DB.prepare(`SELECT published FROM news WHERE id=10`).first()).published, 1, 'reviewing changes nothing public');
    const done = await api('POST', 'copyright/update', { id, status: 'actioned', resolution: 'Removed the photo', unpublish: true });
    assert.equal(done.json.unpublished, true);
    assert.equal((await env.DB.prepare(`SELECT published FROM news WHERE id=10`).first()).published, 0);
    assert.ok((await env.DB.prepare(`SELECT title FROM news WHERE id=10`).first()).title, 'the article is kept');
    const row = await env.DB.prepare(`SELECT status, resolution, resolved_at FROM news_copyright_reports WHERE id=?`).bind(id).first();
    assert.deepEqual([row.status, row.resolution, !!row.resolved_at], ['actioned', 'Removed the photo', true]);
    assert.equal((await api('POST', 'copyright/update', { id, status: 'bogus' })).status, 400);
    assert.equal((await api('POST', 'copyright/update', { id: 999, status: 'rejected' })).status, 404);
  });
  test('admin screen exists and uses DOM calls only', () => {
    const src = readFileSync(join(ROOT, 'js-src/newsroom-admin/08-audience-tools.js'), 'utf-8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(src));
    assert.ok(readFileSync(join(ROOT, 'templates/pages/admin/newsroom.html'), 'utf-8').includes('data-nr-tab="reports"'));
    assert.ok(readFileSync(join(ROOT, 'static/js/newsroom-admin.js'), 'utf-8').includes('renderReports'));
    const form = readFileSync(join(ROOT, 'static/js/copyright-report.js'), 'utf-8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(form));
  });
});
