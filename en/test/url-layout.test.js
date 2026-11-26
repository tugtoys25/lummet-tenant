// test/url-layout.test.js -- choose /en/, root or a custom prefix (worker/url-layout.js) and the admin API behind it.
// Real router and real settings route; not covered: the Settings screen in a browser, a real Cloudflare deploy.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { buildLayout, toInternal, toPublic, rewriteBody, rewriteLocation, withUrlLayout, parseOverrides, validPrefix, forgetLayout } from '../worker/url-layout.js';

const O = 'https://site.example';
const DEF = buildLayout({});
const ROOT = buildLayout({ url_layout: 'root' });
const CUS = buildLayout({ url_layout: 'custom', url_custom_prefix: 'us' });
const MIX = buildLayout({ url_layout: 'en', url_page_overrides: '/about = root\n/news = root\nbad line' });

describe('layout model', () => {
  test('default does nothing at all', async () => {
    assert.equal(toInternal(DEF, '/news'), null); assert.equal(toPublic(DEF, '/en/news'), '/en/news');
    const calls = []; const req = new Request(O + '/en/news');
    const res = await withUrlLayout(req, { DB: null }, async (r) => { calls.push(r); return new Response('<a href="/en/news">x</a>', { headers: { 'content-type': 'text/html' } }); });
    assert.equal(calls[0], req, 'same request object'); assert.equal(await res.text(), '<a href="/en/news">x</a>');
  });
  test('bad values fall back to the default; prefix rules', () => {
    assert.equal(buildLayout({ url_layout: 'custom', url_custom_prefix: 'api' }).layout, 'en');
    assert.equal(buildLayout({ url_layout: 'wat' }).layout, 'en');
    for (const p of ['us', 'my-blog', 'a1']) assert.equal(validPrefix(p), true);
    for (const p of ['', 'en', 'static', 'a/b', 'A B', 'x'.repeat(30)]) assert.equal(validPrefix(p), false, p);
    assert.deepEqual(parseOverrides('/about = root\n/news/x:en\nnope'), [{ page: '/news/x', where: 'en' }, { page: '/about', where: 'root' }]);
  });
  test('root: public address maps to the internal /en/ page and back', () => {
    assert.equal(toInternal(ROOT, '/'), '/en'); assert.equal(toInternal(ROOT, '/news'), '/en/news'); assert.equal(toInternal(ROOT, '/casino/lucky'), '/en/casino/lucky');
    assert.equal(toPublic(ROOT, '/en'), '/'); assert.equal(toPublic(ROOT, '/en/news/story'), '/news/story');
  });
  test('dashboard, api and existing system routes never move', () => {
    for (const p of ['/en/dashboard/settings', '/en/api/v1/news/list', '/en/admin']) assert.equal(toPublic(ROOT, p), p, p);
    for (const p of ['/robots.txt', '/media/x.png', '/favicon.ico', '/static/a.css']) assert.equal(toInternal(ROOT, p), null, p);
    assert.equal(toInternal(ROOT, '/dashboard/x'), null);
  });
  test('custom prefix', () => {
    assert.equal(toInternal(CUS, '/us/news'), '/en/news'); assert.equal(toInternal(CUS, '/us'), '/en'); assert.equal(toInternal(CUS, '/news'), null, 'root address is not used in custom mode');
    assert.equal(toPublic(CUS, '/en/news'), '/us/news'); assert.equal(toPublic(CUS, '/en'), '/us');
  });
  test('per-page choice: longest rule wins, others keep /en/', () => {
    assert.equal(toPublic(MIX, '/en/about'), '/about'); assert.equal(toPublic(MIX, '/en/news/story'), '/news/story'); assert.equal(toPublic(MIX, '/en/casino'), '/en/casino');
    assert.equal(toInternal(MIX, '/about'), '/en/about'); assert.equal(toInternal(MIX, '/casino'), null, 'not moved, so no root address');
    const nested = buildLayout({ url_layout: 'root', url_page_overrides: '/news/archive = en' });
    assert.equal(toPublic(nested, '/en/news'), '/news'); assert.equal(toPublic(nested, '/en/news/archive/2020'), '/en/news/archive/2020');
  });
  test('body and redirect rewriting touch only page links', () => {
    const html = `<a href="/en/news">n</a> <a href='${O}/en/casino/x?y=1#z'>c</a> <form action="/en/api/v1/x"></form> <script>fetch('/en/api/v1/q')</script> <a href="/english">e</a> <a href="https://other.com/en/news">o</a> <link rel=canonical href="${O}/en"> <a href="/static/en/x.css">s</a>`;
    const out = rewriteBody(ROOT, html, O);
    assert.match(out, /href="\/news"/); assert.match(out, new RegExp(`href='${O}/casino/x\\?y=1#z'`)); assert.match(out, /action="\/en\/api\/v1\/x"/); assert.match(out, /fetch\('\/en\/api\/v1\/q'\)/);
    assert.match(out, /href="\/english"/); assert.match(out, /https:\/\/other\.com\/en\/news/); assert.match(out, new RegExp(`href="${O}/"`)); assert.match(out, /\/static\/en\/x\.css/);
    assert.equal(rewriteLocation(ROOT, '/en/news', O), '/news'); assert.equal(rewriteLocation(ROOT, O + '/en/casino', O), O + '/casino'); assert.equal(rewriteLocation(ROOT, 'https://o.com/en/news', O), 'https://o.com/en/news');
  });
});

describe('front door', () => {
  const run = async (L, url, init = {}) => {
    const seen = []; const db = { prepare: () => ({ bind() { return this; }, all: async () => ({ results: Object.entries(L).map(([key, value]) => ({ key, value })) }) }) };
    forgetLayout(db);
    const res = await withUrlLayout(new Request(url, init), { DB: db }, async (r) => { seen.push(new URL(r.url).pathname); return new Response('<a href="/en/news">n</a>', { headers: { 'content-type': 'text/html; charset=utf-8', 'content-length': '24' } }); });
    return { seen, res };
  };
  test('root: / and /news reach the internal page; the page links come back clean', async () => {
    const a = await run({ url_layout: 'root' }, O + '/news'); assert.deepEqual(a.seen, ['/en/news']); assert.equal(await a.res.text(), '<a href="/news">n</a>'); assert.equal(a.res.headers.get('content-length'), null);
    const b = await run({ url_layout: 'root' }, O + '/'); assert.deepEqual(b.seen, ['/en']);
  });
  test('old /en/ page redirects (301) for browsers, but API and non-HTML calls pass', async () => {
    const r = await run({ url_layout: 'root' }, O + '/en/news?x=1', { headers: { accept: 'text/html' } });
    assert.equal(r.res.status, 301); assert.equal(r.res.headers.get('location'), O + '/news?x=1'); assert.deepEqual(r.seen, []);
    assert.deepEqual((await run({ url_layout: 'root' }, O + '/en/api/v1/news/list', { headers: { accept: 'text/html' } })).seen, ['/en/api/v1/news/list']);
    assert.deepEqual((await run({ url_layout: 'root' }, O + '/en/news')).seen, ['/en/news'], 'fetch() calls without text/html are served as before');
    assert.equal((await run({ url_layout: 'root', url_legacy_redirect: '0' }, O + '/en/news', { headers: { accept: 'text/html' } })).seen[0], '/en/news');
  });
  test('POST bodies survive the address change', async () => {
    let body = null; const db = { prepare: () => ({ bind() { return this; }, all: async () => ({ results: [{ key: 'url_layout', value: 'root' }] }) }) }; forgetLayout(db);
    await withUrlLayout(new Request(O + '/newsletter/subscribe', { method: 'POST', body: 'a=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } }), { DB: db }, async (r) => { body = await r.text(); return new Response('ok'); });
    assert.equal(body, 'a=1');
  });
  test('a database failure falls back to /en/ untouched', async () => {
    const db = { prepare: () => { throw new Error('d1 down'); } }; const req = new Request(O + '/news'); let got;
    await withUrlLayout(req, { DB: db }, async (r) => { got = r; return new Response('x'); }); assert.equal(got, req);
  });
});

describe('admin API', () => {
  test('only admins; validates; saves; reads back with examples', async () => {
    const { route } = await import('../worker/api/routes/settings.js');
    const db = createTestDb(); applyMigrations(db); const env = { DB: db };
    const call = (method, body, user = { user_id: 1, role: 'admin' }) => route({ request: new Request(O + '/api/v1/settings/url-layout', { method, ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) }), env, path: '/api/v1/settings/url-layout', user });
    assert.equal((await call('GET', null, { user_id: 2, role: 'editor' })).status, 403);
    assert.equal((await call('POST', { url_layout: 'custom', url_custom_prefix: 'api' })).status, 400);
    assert.equal((await call('POST', { url_layout: 'root', url_page_overrides: 'junk' })).status, 400);
    const ok = await call('POST', { url_layout: 'root', url_page_overrides: '/about = en' }); assert.equal(ok.status, 200);
    const j = await (await call('GET')).json(); assert.equal(j.layout.url_layout, 'root'); assert.equal(j.layout.url_page_overrides, '/about = en');
    assert.deepEqual(j.examples.find((e) => e.from === '/en/news'), { from: '/en/news', to: '/news' }); assert.equal(j.examples.find((e) => e.from === '/en/about').to, '/en/about');
    await call('POST', { url_layout: 'en' }); assert.equal((await (await call('GET')).json()).layout.url_layout, 'en');
  });
});
