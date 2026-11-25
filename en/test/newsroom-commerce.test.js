// test/newsroom-commerce.test.js -- news commerce layer: switches, per-article mode, widgets, sticky bar, gallery, inquiry form, admin API, click attribution.
// Real migrated schema, real article controller and real redirect handler. Not covered: real browsers (the inquiry script, the sticky-bar observer and the lightbox are not executed).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as commerce from '../worker/newsroom-commerce.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import { renderNews, handleAffiliateRedirect } from '../worker/controllers.js';
import { resetNewsFlagCache } from '../worker/database/newsroom.js';
import * as ops from '../worker/newsroom-ops.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://news.example.com';
const ADMIN = { user_id: 1, role: 'admin' };
const BODY = '<p>First paragraph.</p><p>Middle paragraph.</p><p>Last paragraph.</p>';

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,role) VALUES (1,'elie','Elie','Editor')`).run();
  const ins = `INSERT INTO news (id,slug,title,content,published,published_at,author_id,created_by,excerpt,tags,content_class) VALUES (?,?,?,?,1,'2026-02-01 10:00:00',1,1,'x','',?)`;
  await db.prepare(ins).bind(1, 'review-one', 'Best <kettle> 2026', BODY, 'editorial').run();
  await db.prepare(ins).bind(2, 'plain', 'Plain news', BODY, 'editorial').run();
  await db.prepare(ins).bind(3, 'flat-for-sale', 'Flat for sale', BODY, 'editorial').run();
  await db.prepare(`INSERT INTO tracking_links (id, internal_name, tracking_code, destination_url, status, health_status) VALUES (1,'Amazon kettle','kettle1','https://amazon.example/kettle','active','healthy')`).run();
  await db.prepare(`INSERT INTO tracking_links (id, internal_name, tracking_code, destination_url, status, health_status) VALUES (2,'Dead link','dead1','https://amazon.example/dead','active','broken')`).run();
  await db.prepare(`INSERT INTO media_library (id, filename, url, thumbnail_url, alt_text, type, mime_type) VALUES (1,'a.jpg','https://img.example.com/a.jpg','https://img.example.com/a-t.jpg','Front','image','image/jpeg')`).run();
  await db.prepare(`INSERT INTO media_library (id, filename, url, type, mime_type) VALUES (2,'x.mp3','https://img.example.com/x.mp3','audio','audio/mpeg')`).run();
  const env = { DB: db, SITE_URL: BASE, ASSETS: { fetch: async (req) => { const f = join(ROOT, new URL(req.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8'), { status: 200 }) : new Response('', { status: 404 }); } } };
  reset(env); return env;
}
const reset = (env) => { resetNewsFlagCache(); ops.forgetOpsFlags(env.DB); commerce.forgetCommerceFlags(env.DB); };
const flag = async (env, key, value = 'true') => { await env.DB.prepare(`INSERT INTO system_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(key, value).run(); reset(env); };
const allOn = async (env) => { for (const k of commerce.COMMERCE_FLAG_KEYS) await flag(env, k); };
const page = async (env, slug) => (await renderNews(new Request(`${BASE}/en/news/${slug}`), env, slug, null)).text();
const api = async (env, method, route, body) => {
  const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body);
  const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, ADMIN);
  return { status: res.status, json: await res.json() };
};
const W = (o) => ({ slot: 'top', widget_type: 'buy', title: 'Kettle X', price_text: '$49', tracking_link_id: 1, ...o });
const save = (env, id, widgets, config = { mode: 'review' }, gallery = []) => api(env, 'POST', 'commerce/save', { id, config, widgets, gallery });

describe('migration and switches', () => {
  test('0032 creates the tables and the five switches, all off', async () => {
    const env = await mkEnv();
    const names = (await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all()).results.map((r) => r.name);
    for (const t of ['news_commerce', 'news_widgets', 'news_gallery_items', 'news_inquiries']) assert.ok(names.includes(t), t);
    const rows = (await env.DB.prepare(`SELECT key, value FROM system_settings WHERE key LIKE 'news_commerce%'`).all()).results;
    assert.equal(rows.length, 5);
    assert.ok(rows.every((r) => r.value === 'false'));
  });

  test('switches off: the article page is byte-identical even when widgets are configured', async () => {
    const env = await mkEnv();
    const before = await page(env, 'review-one');
    assert.equal((await save(env, 1, [W({})])).json.success, true);
    assert.equal(await page(env, 'review-one'), before);
  });

  test('master on but mode editorial: nothing changes', async () => {
    const env = await mkEnv();
    const before = await page(env, 'plain');
    await allOn(env);
    assert.equal(await page(env, 'plain'), before);
  });
});

describe('rendering', () => {
  test('review mode: widgets after the first and the last paragraph, tracked /go links, disclosure, escaped text', async () => {
    const env = await mkEnv(); await allOn(env);
    const r = await save(env, 1, [W({ title: 'Top <b>pick</b>' }), W({ slot: 'bottom', title: 'Last call' })]);
    assert.equal(r.json.success, true, JSON.stringify(r.json));
    const html = await page(env, 'review-one');
    const iFirst = html.indexOf('First paragraph.</p>'), iTop = html.indexOf('data-nc-slot="top"'), iMid = html.indexOf('Middle paragraph.</p>');
    const iLast = html.indexOf('Last paragraph.</p>'), iBottom = html.indexOf('data-nc-slot="bottom"');
    assert.ok(iFirst > -1 && iTop > iFirst && iTop < iMid, 'top widget after paragraph 1');
    assert.ok(iBottom > iLast, 'bottom widget after the last paragraph');
    assert.match(html, /href="\/en\/go\/kettle1\?n=1&amp;w=\d+&amp;utm_source=news/);
    assert.match(html, /rel="sponsored nofollow noopener"/);
    assert.ok(html.includes('class="nc-disclosure"'));
    assert.ok(!html.includes('<b>pick</b>'), 'widget text is escaped');
    assert.ok(html.includes('Top &lt;b&gt;pick&lt;/b&gt;'));
  });

  test('below widgets sit in a column grid and the sticky bar uses the casino sticky class', async () => {
    const env = await mkEnv(); await allOn(env);
    await save(env, 1, [W({}), W({ slot: 'below', title: 'Alt A' }), W({ slot: 'below', title: 'Alt B', widget_type: 'product' })]);
    const html = await page(env, 'review-one');
    assert.match(html, /class="nc-below"/);
    assert.equal((html.match(/data-nc-slot="below"/g) || []).length, 2);
    assert.match(html, /class="mobile-sticky-cta nc-sticky" id="ncSticky"/);
  });

  test('sticky bar only with its own switch; widgets only with theirs; gallery only with its own', async () => {
    const env = await mkEnv(); await allOn(env);
    await save(env, 1, [W({})], { mode: 'review' }, [{ media_id: 1, caption: 'Front view' }]);
    await flag(env, 'news_commerce_sticky_bar', 'false');
    let html = await page(env, 'review-one');
    assert.ok(!html.includes('ncSticky') || !html.includes('id="ncSticky"'));
    assert.match(html, /nr-gallery/);
    await flag(env, 'news_commerce_gallery', 'false');
    assert.ok(!(await page(env, 'review-one')).includes('class="nc-gallery-wrap"'));
    await flag(env, 'news_commerce_widgets', 'false');
    assert.ok(!(await page(env, 'review-one')).includes('data-nc-widget'));
  });

  test('a broken tracking link leaves the widget out instead of showing a dead button', async () => {
    const env = await mkEnv(); await allOn(env);
    await save(env, 1, [W({ tracking_link_id: 2, title: 'Dead one' })]);
    const html = await page(env, 'review-one');
    assert.ok(!html.includes('Dead one'));
    assert.ok(!html.includes('/en/go/dead1'));
  });

  test('scheduled and paused widgets do not show', async () => {
    const env = await mkEnv(); await allOn(env);
    await save(env, 1, [W({ title: 'Future', starts_at: '2999-01-01' }), W({ title: 'Paused', status: 'paused' }), W({ title: 'Expired', ends_at: '2001-01-01' }), W({ title: 'Live one' })]);
    const html = await page(env, 'review-one');
    assert.ok(html.includes('Live one'));
    for (const t of ['Future', 'Paused', 'Expired']) assert.ok(!html.includes(t), t);
  });

  test('listing mode: inquiry form, specs, gallery, enquire sticky bar, no affiliate disclosure', async () => {
    const env = await mkEnv(); await allOn(env);
    const r = await save(env, 3, [{ slot: 'top', widget_type: 'inquiry', title: 'Ask about this flat', price_text: '$250,000', specs: [{ label: 'Bedrooms', value: '3' }] }], { mode: 'listing' }, [{ media_id: 1 }]);
    assert.equal(r.json.success, true, JSON.stringify(r.json));
    const html = await page(env, 'flat-for-sale');
    assert.match(html, /<form class="nc-inquiry"/);
    assert.match(html, /<dt>Bedrooms<\/dt><dd>3<\/dd>/);
    assert.match(html, /href="#nc-inquiry-\d+"/);
    assert.ok(!html.includes('class="nc-disclosure"'));
    assert.match(html, /\/static\/js\/news-media\.js/);
  });

  test('sponsored content gets the disclosure even without a tracked link', async () => {
    const env = await mkEnv(); await allOn(env);
    await env.DB.prepare(`UPDATE news SET content_class = 'sponsored' WHERE id = 3`).run();
    await save(env, 3, [{ slot: 'top', widget_type: 'price', title: 'Price box', price_text: '$1' }], { mode: 'blog' });
    assert.ok((await page(env, 'flat-for-sale')).includes('class="nc-disclosure"'));
  });

  test('injectInline handles no-paragraph and single-paragraph text', () => {
    assert.equal(commerce.injectInline('plain', 'T', 'B'), 'TplainB');
    assert.equal(commerce.injectInline('<p>a</p>', 'T', 'B'), '<p>a</p>TB');
    assert.equal(commerce.injectInline('<p>a</p><p>b</p>', 'T', ''), '<p>a</p>T<p>b</p>');
  });
});

describe('inquiry form', () => {
  const good = { slug: 'flat-for-sale', name: 'Ann', email: 'ann@example.com', message: 'Is it still available?', consent: true };
  async function ready() {
    const env = await mkEnv(); await allOn(env);
    await save(env, 3, [{ slot: 'top', widget_type: 'inquiry', title: 'Ask' }], { mode: 'listing' });
    const wid = (await env.DB.prepare(`SELECT id FROM news_widgets WHERE news_id = 3`).first()).id;
    return { env, wid };
  }
  test('stores a valid enquiry and de-duplicates a repeat', async () => {
    const { env, wid } = await ready();
    assert.equal((await commerce.submitInquiry(env, { body: { ...good, widget_id: wid }, ip: '1.1.1.1', country: 'GB' })).ok, true);
    assert.equal((await commerce.submitInquiry(env, { body: { ...good, widget_id: wid }, ip: '1.1.1.1' })).ok, true);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS c FROM news_inquiries`).first()).c, 1);
  });
  test('refuses: no consent, bad email, unknown widget, flag off; honeypot stores nothing', async () => {
    const { env, wid } = await ready();
    assert.equal((await commerce.submitInquiry(env, { body: { ...good, widget_id: wid, consent: false }, ip: 'a' })).status, 400);
    assert.equal((await commerce.submitInquiry(env, { body: { ...good, widget_id: wid, email: 'nope' }, ip: 'a' })).status, 400);
    assert.equal((await commerce.submitInquiry(env, { body: { ...good, widget_id: 9999 }, ip: 'a' })).status, 404);
    assert.equal((await commerce.submitInquiry(env, { body: { ...good, widget_id: wid, website: 'http://spam' }, ip: 'a' })).ok, true);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS c FROM news_inquiries`).first()).c, 0);
    await flag(env, 'news_commerce_inquiry', 'false');
    assert.equal((await commerce.submitInquiry(env, { body: { ...good, widget_id: wid }, ip: 'a' })).status, 404);
  });
  test('five per hour per connection', async () => {
    const { env, wid } = await ready();
    for (let i = 0; i < 5; i++) assert.equal((await commerce.submitInquiry(env, { body: { ...good, widget_id: wid, message: `Question number ${i}` }, ip: '9.9.9.9' })).ok, true);
    assert.equal((await commerce.submitInquiry(env, { body: { ...good, widget_id: wid, message: 'One more question' }, ip: '9.9.9.9' })).status, 429);
  });
});

describe('admin API', () => {
  test('save then read back, with picker lists and the inbox', async () => {
    const env = await mkEnv();
    const r = await save(env, 1, [W({ specs: [{ label: 'Colour', value: 'Red' }] })], { mode: 'review', cta_label: 'Check price', sticky_enabled: true }, [{ media_id: 1, caption: 'c' }]);
    assert.equal(r.json.success, true, JSON.stringify(r.json));
    const g = (await api(env, 'GET', 'commerce/article?id=1')).json;
    assert.equal(g.config.mode, 'review'); assert.equal(g.widgets.length, 1); assert.equal(g.widgets[0].specs[0].value, 'Red'); assert.equal(g.gallery[0].caption, 'c');
    assert.equal((await api(env, 'GET', 'commerce/links')).json.links.length, 2);
    assert.equal((await api(env, 'GET', 'commerce/images')).json.images.length, 1);   // the mp3 is not offered
    assert.equal((await api(env, 'GET', 'commerce/inquiries')).json.inquiries.length, 0);
  });
  test('validation: buy widget needs a tracking link, bad picture, bad mode, audio in gallery, sticky inquiry; nothing is written', async () => {
    const env = await mkEnv();
    await save(env, 1, [W({ title: 'Keep me' })]);
    for (const bad of [
      [[W({ tracking_link_id: null })], { mode: 'review' }, []],
      [[W({ image_url: 'javascript:alert(1)' })], { mode: 'review' }, []],
      [[W({})], { mode: 'bogus' }, []],
      [[W({})], { mode: 'review' }, [{ media_id: 2 }]],
      [[{ slot: 'sticky', widget_type: 'inquiry', title: 'x' }], { mode: 'listing' }, []],
      [[W({ tracking_link_id: 999 })], { mode: 'review' }, []],
      [[W({ go_code: 'bad code!' })], { mode: 'review' }, []]
    ]) { const r = await save(env, 1, bad[0], bad[1], bad[2]); assert.equal(r.status, 400, JSON.stringify(bad)); }
    assert.equal((await env.DB.prepare(`SELECT title FROM news_widgets WHERE news_id = 1`).first()).title, 'Keep me');
  });
  test('the five switches are listed in the flag screen and can be saved', async () => {
    const env = await mkEnv();
    const f = (await api(env, 'GET', 'flags')).json.flags.filter((x) => x.key.startsWith('news_commerce'));
    assert.equal(f.length, 5); assert.ok(f.every((x) => x.label !== x.key));
    assert.equal((await api(env, 'POST', 'flags/save', { flags: { news_commerce: true } })).json.success, true);
    assert.equal((await commerce.getCommerceFlags(env.DB)).news_commerce, true);
  });
  test('inquiry status can be changed', async () => {
    const env = await mkEnv(); await allOn(env);
    await save(env, 3, [{ slot: 'top', widget_type: 'inquiry', title: 'Ask' }], { mode: 'listing' });
    const wid = (await env.DB.prepare(`SELECT id FROM news_widgets`).first()).id;
    await commerce.submitInquiry(env, { body: { slug: 'flat-for-sale', widget_id: wid, name: 'Ann', email: 'ann@example.com', message: 'Hello there', consent: true }, ip: 'z' });
    const id = (await env.DB.prepare(`SELECT id FROM news_inquiries`).first()).id;
    assert.equal((await api(env, 'POST', 'commerce/inquiry-status', { id, status: 'replied' })).json.success, true);
    assert.equal((await api(env, 'POST', 'commerce/inquiry-status', { id, status: 'weird' })).status, 400);
    assert.equal((await api(env, 'GET', 'commerce/inquiries?status=replied')).json.inquiries.length, 1);
  });
});

describe('click attribution through /en/go', () => {
  const wait = () => new Promise((r) => setTimeout(r, 60));
  test('records news_id and widget id for a real article; ignores made-up ids; plain clicks are unchanged', async () => {
    const env = await mkEnv();
    const go = async (qs) => { const res = await handleAffiliateRedirect(new Request(`${BASE}/en/go/kettle1${qs}`), env, 'kettle1', null); await wait(); return res; };
    const res = await go('?n=1&w=7&utm_source=news');
    assert.equal(res.status, 302);
    let ev = await env.DB.prepare(`SELECT news_id, metadata FROM analytics_events WHERE event_type = 'TRACKING_LINK_CLICK' ORDER BY id DESC LIMIT 1`).first();
    assert.equal(ev.news_id, 1); assert.equal(JSON.parse(ev.metadata).news_widget_id, 7);
    await go('?n=9999&w=1');
    ev = await env.DB.prepare(`SELECT news_id FROM analytics_events WHERE event_type = 'TRACKING_LINK_CLICK' ORDER BY id DESC LIMIT 1`).first();
    assert.equal(ev.news_id, null);
    await go('');
    ev = await env.DB.prepare(`SELECT news_id FROM analytics_events WHERE event_type = 'TRACKING_LINK_CLICK' ORDER BY id DESC LIMIT 1`).first();
    assert.equal(ev.news_id, null);
  });
});

describe('structure', () => {
  test('the article controller wraps the commerce layer so it can never break the page', () => {
    const src = readFileSync(join(ROOT, 'worker/controllers/news/article.js'), 'utf-8');
    assert.match(src, /try \{\s*const cdata = await loadCommerce[\s\S]*?catch \(e\) \{ console\.error\("Commerce layer skipped:"/);
  });
  test('the migration alters no existing table', () => {
    const sql = readFileSync(join(ROOT, 'migrations/0032_news_commerce.sql'), 'utf-8');
    assert.ok(!/ALTER\s+TABLE/i.test(sql));
  });
});
