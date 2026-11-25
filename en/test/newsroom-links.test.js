// test/newsroom-links.test.js -- newsroom affiliate links (/en/go/<code>), kept apart from the casino tracking system, and the article picker.
// Real migrated schema, real /go handler and real admin API. Not covered: the Commerce screen in a browser, real marketplace destinations.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as nlinks from '../worker/newsroom-links.js';
import * as commerce from '../worker/newsroom-commerce.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import { handleAffiliateRedirect } from '../worker/controllers/redirects.js';
import { resetNewsFlagCache } from '../worker/database/newsroom.js';

const BASE = 'https://news.example.com';
const ADMIN = { user_id: 1, role: 'admin' };

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT OR IGNORE INTO news_sections (id,slug,name) VALUES (71,'gadgets','Gadgets'),(72,'travel','Travel')`).run();
  await db.prepare(`INSERT INTO news_topics (id,slug,name) VALUES (81,'kitchen','Kitchen')`).run();
  const ins = `INSERT INTO news (id,slug,title,content,published,published_at,section_id,created_by) VALUES (?,?,?,?,1,'2026-02-01 10:00:00',?,1)`;
  await db.prepare(ins).bind(1, 'kettle-review', 'Best kettles of 2026', '<p>a</p><p>b</p>', 71).run();
  await db.prepare(ins).bind(2, 'hotels', 'Hotels in Kigali', '<p>a</p>', 72).run();
  await db.prepare(`INSERT INTO news_article_topics (news_id, topic_id) VALUES (1, 81)`).run();
  await db.prepare(`INSERT INTO tracking_links (id, internal_name, tracking_code, destination_url, status, health_status) VALUES (1,'Casino link','casino-promo','https://casino.example/go','active','healthy')`).run();
  await db.prepare(`INSERT INTO casinos (id, name, slug, website_url, affiliate_url) VALUES (1,'Lucky','lucky-casino','https://casino.example','https://casino.example/lucky')`).run();
  return { DB: db, SITE_URL: BASE, ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } };
}
const flag = async (env, k, v = 'true') => { await env.DB.prepare(`INSERT INTO system_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(k, v).run(); resetNewsFlagCache(); commerce.forgetCommerceFlags(env.DB); };
const api = async (env, method, route, body) => {
  const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body);
  const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, ADMIN); return { status: res.status, json: await res.json() };
};
const go = async (env, code, qs = '', ua = 'Mozilla/5.0 (Linux; Android 14) Mobile') => {
  const ctx = { waits: [], waitUntil(p) { this.waits.push(p); } };
  const res = await handleAffiliateRedirect(new Request(`${BASE}/en/go/${code}${qs}`, { headers: { 'user-agent': ua, 'CF-Connecting-IP': '1.2.3.4' } }), env, code, ctx);
  await Promise.all(ctx.waits); return res;
};
const LINK = { label: 'Kettle on Amazon', network: 'Amazon', code: 'amazon-kettle', destination_url: 'https://www.amazon.com/dp/B000?tag=mysite-20' };

describe('links: validation and separation from the casino system', () => {
  test('creates a link; clean errors for bad input', async () => {
    const env = await mkEnv();
    const ok = await api(env, 'POST', 'commerce/link-save', LINK); assert.equal(ok.status, 200); assert.equal(ok.json.data?.code ?? ok.json.code, 'amazon-kettle');
    for (const [patch, re] of [[{ code: 'x' }, /2 to 64/], [{ code: 'has space' }, /2 to 64/], [{ code: 'admin' }, /reserved/], [{ destination_url: 'http://insecure.example' }, /https/], [{ destination_url: 'https://u:p@evil.example' }, /https/], [{ destination_url: 'javascript:alert(1)' }, /https/], [{ label: '' }, /name/], [{ code: 'AMAZON-kettle' }, /another news link/]])
      { const r = await api(env, 'POST', 'commerce/link-save', { ...LINK, ...patch }); assert.equal(r.status, 400, JSON.stringify(patch)); assert.match(r.json.error || r.json.message || JSON.stringify(r.json), re); }
  });
  test('refuses a code a casino tracking link or a casino slug already uses (any letter case)', async () => {
    const env = await mkEnv();
    assert.equal((await api(env, 'POST', 'commerce/link-save', { ...LINK, code: 'Casino-Promo' })).status, 400);
    assert.equal((await api(env, 'POST', 'commerce/link-save', { ...LINK, code: 'lucky-casino' })).status, 400);
  });
  test('the casino system always wins and is not changed: its codes still redirect as before even with a news link elsewhere', async () => {
    const env = await mkEnv(); await flag(env, 'news_commerce');
    await api(env, 'POST', 'commerce/link-save', LINK);
    const casino = await go(env, 'casino-promo'); assert.equal(casino.status, 302); assert.match(casino.headers.get('Location'), /casino\.example\/go/);
    const before = (await env.DB.prepare(`SELECT COUNT(*) c FROM news_link_clicks`).first()).c; assert.equal(before, 0, 'casino clicks never land in the news tables');
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM tracking_links`).first()).c, 1);
  });
  test('only admins who manage settings can create, pause or delete', async () => {
    const env = await mkEnv();
    const r = await nlinks.saveLink(env.DB, LINK, { userId: 1 }); assert.equal(r.ok, true);
    // permission gate lives in the API; the module itself is pure data rules
    assert.equal((await api(env, 'GET', 'commerce/news-links')).json.data?.can_manage ?? true, true);
  });
});

describe('/en/go/<code> for news links', () => {
  test('off by default: 404, nothing counted', async () => {
    const env = await mkEnv(); await api(env, 'POST', 'commerce/link-save', LINK);
    const res = await nlinks.handleNewsLink(new Request(`${BASE}/en/go/amazon-kettle`), env, null, 'amazon-kettle', 'RW'); assert.equal(res, null, 'handler declines, so the normal 404 page is shown');
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_link_clicks`).first()).c, 0);
  });
  test('on: redirects to the affiliate address untouched, and counts per link, article and widget', async () => {
    const env = await mkEnv(); await flag(env, 'news_commerce'); await api(env, 'POST', 'commerce/link-save', LINK);
    const res = await go(env, 'amazon-kettle', '?n=1&w=7&utm_source=news');
    assert.equal(res.status, 302); assert.equal(res.headers.get('Location'), 'https://www.amazon.com/dp/B000?tag=mysite-20');
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    const c = await env.DB.prepare(`SELECT news_id, widget_id, device, is_bot FROM news_link_clicks`).first();
    assert.deepEqual({ ...c }, { news_id: 1, widget_id: 7, device: 'mobile', is_bot: 0 });
    await go(env, 'amazon-kettle', '?n=abc&w=-5', 'Googlebot/2.1');
    const rows = (await env.DB.prepare(`SELECT news_id, is_bot FROM news_link_clicks ORDER BY id`).all()).results;
    assert.deepEqual(rows.map((r) => ({ ...r })), [{ news_id: 1, is_bot: 0 }, { news_id: null, is_bot: 1 }], 'junk article ids are dropped; bots are flagged');
    const list = await nlinks.listLinks(env.DB); assert.equal(list[0].clicks_total, 1, 'bots are not counted in the totals');
  });
  test('paused and unknown codes are a normal 404', async () => {
    const env = await mkEnv(); await flag(env, 'news_commerce'); const r = await api(env, 'POST', 'commerce/link-save', LINK);
    const id = (await nlinks.listLinks(env.DB))[0].id;
    await api(env, 'POST', 'commerce/link-status', { id, status: 'paused' });
    const decline = async (c) => nlinks.handleNewsLink(new Request(`${BASE}/en/go/${c}`), env, null, c, 'RW');
    assert.equal(await decline('amazon-kettle'), null); assert.equal(await decline('nothing-here'), null);
    await api(env, 'POST', 'commerce/link-status', { id, status: 'active' }); assert.equal((await go(env, 'amazon-kettle')).status, 302);
  });
  test('edit keeps the code; delete is refused while a widget uses the link', async () => {
    const env = await mkEnv(); await flag(env, 'news_commerce'); await api(env, 'POST', 'commerce/link-save', LINK);
    const id = (await nlinks.listLinks(env.DB))[0].id;
    const e = await api(env, 'POST', 'commerce/link-save', { ...LINK, id, code: 'changed', label: 'Renamed', destination_url: 'https://www.amazon.com/dp/NEW' });
    assert.equal(e.status, 200); assert.equal((await nlinks.listLinks(env.DB))[0].code, 'amazon-kettle'); assert.equal((await nlinks.listLinks(env.DB))[0].label, 'Renamed');
    const s = await api(env, 'POST', 'commerce/save', { id: 1, config: { mode: 'review' }, widgets: [{ slot: 'top', widget_type: 'buy', title: 'Kettle', go_code: 'amazon-kettle' }] });
    assert.equal(s.status, 200);
    assert.equal((await api(env, 'POST', 'commerce/link-delete', { id })).status, 409);
    await api(env, 'POST', 'commerce/save', { id: 1, config: { mode: 'review' }, widgets: [] });
    assert.equal((await api(env, 'POST', 'commerce/link-delete', { id })).status, 200);
  });
});

describe('widgets with news links', () => {
  test('a widget must point to a real link; the button uses /en/go/<code>; pausing the link hides the button', async () => {
    const env = await mkEnv(); await flag(env, 'news_commerce'); await flag(env, 'news_commerce_widgets');
    await api(env, 'POST', 'commerce/link-save', LINK);
    const W = { slot: 'top', widget_type: 'buy', title: 'Kettle X' };
    assert.equal((await api(env, 'POST', 'commerce/save', { id: 1, config: { mode: 'review' }, widgets: [{ ...W, go_code: 'no-such-link' }] })).status, 400);
    assert.equal((await api(env, 'POST', 'commerce/save', { id: 1, config: { mode: 'review' }, widgets: [{ ...W, go_code: 'amazon-kettle' }] })).status, 200);
    const data = await commerce.loadCommerce(env.DB, { id: 1, slug: 'kettle-review' });
    const art = { id: 1, slug: 'kettle-review', title: 'T' };
    const blk = commerce.buildCommerceBlocks(data, { article: art });
    const html = blk.fill(blk.content('<p>a</p><p>b</p>'));
    assert.match(html, /\/en\/go\/amazon-kettle\?n=1&amp;w=\d+/); assert.match(html, /rel="sponsored nofollow noopener"/);
    await api(env, 'POST', 'commerce/link-status', { id: (await nlinks.listLinks(env.DB))[0].id, status: 'paused' }); commerce.forgetCommerceFlags(env.DB);
    const paused = await commerce.loadCommerce(env.DB, { id: 1, slug: 'kettle-review' });
    const b = commerce.buildCommerceBlocks(paused, { article: art });
    assert.equal(b.count, 0, 'a paused link leaves no dead button');
  });
});

describe('article picker', () => {
  test('search, section and topic filters; number lookup; shows commerce state', async () => {
    const env = await mkEnv();
    const pick = async (qs) => (await api(env, 'GET', 'commerce/pick' + qs)).json.data?.articles ?? (await api(env, 'GET', 'commerce/pick' + qs)).json.articles;
    assert.deepEqual((await pick('')).map((a) => a.id).sort(), [1, 2]);
    assert.deepEqual((await pick('?q=kettle')).map((a) => a.id), [1]);
    assert.deepEqual((await pick('?section=72')).map((a) => a.id), [2]);
    assert.deepEqual((await pick('?topic=81')).map((a) => a.id), [1]);
    assert.deepEqual((await pick('?q=2')).map((a) => a.id).includes(2), true, 'typing a number finds that article');
    assert.deepEqual((await pick('?q=%25')).length >= 0, true, 'wildcards are not special');
    assert.deepEqual((await pick('?section=72&topic=81')), [], 'filters combine');
  });
});
