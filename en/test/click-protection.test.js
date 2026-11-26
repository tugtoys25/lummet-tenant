// test/click-protection.test.js -- Click protection for tracked links (worker/tracking/bot-shield.js) wired into the real
// /go/ redirect, the real settings API and robots.txt. Not covered: the Settings screen in a browser, Cloudflare's own bot score.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { inspectRequest, decide, goRedirect } from '../worker/tracking/bot-shield.js';
import * as shield from '../worker/tracking/bot-shield.js';
import { handleAffiliateRedirect } from '../worker/controllers/redirects.js';

const BASE = 'https://s.example';
const HUMAN = { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Mobile Safari/537.36', 'accept-language': 'en-US,en;q=0.9', 'CF-Connecting-IP': '9.9.9.9' };
const mkEnv = async (mode) => {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO tracking_links (id, internal_name, tracking_code, destination_url, status, health_status) VALUES (1,'Promo','promo','https://operator.example/go','active','healthy')`).run();
  if (mode) await db.prepare(`INSERT INTO settings (key,value) VALUES ('go_bot_mode',?)`).bind(mode).run();
  shield.forgetShieldSettings(db); return { DB: db, ASSETS: { fetch: async () => new Response('nf', { status: 404 }) } };
};
const go = async (env, headers = HUMAN, method = 'GET') => {
  const ctx = { w: [], waitUntil(p) { this.w.push(p); } };
  const res = await handleAffiliateRedirect(new Request(`${BASE}/en/go/promo`, { method, headers }), env, 'promo', ctx); await Promise.all(ctx.w);
  const ev = await env.DB.prepare(`SELECT is_bot, metadata FROM analytics_events ORDER BY id DESC LIMIT 1`).first(); return { res, ev };
};

describe('signals', () => {
  const req = (h, m = 'GET', cf) => { const r = new Request(BASE + '/x', { method: m, headers: h }); if (cf) Object.defineProperty(r, 'cf', { value: cf }); return r; };
  test('a normal browser raises nothing; one weak signal is not enough', () => {
    assert.equal(decide(inspectRequest(req(HUMAN))).suspect, false);
    assert.equal(decide(inspectRequest(req({ 'user-agent': HUMAN['user-agent'] }))).suspect, false, 'only no Accept-Language');
  });
  test('strong signals', () => {
    for (const h of [{ 'user-agent': 'python-requests/2.31', 'accept-language': 'en' }, { 'user-agent': 'Mozilla/5.0 HeadlessChrome/120', 'accept-language': 'en' }, { ...HUMAN, 'sec-purpose': 'prefetch' }])
      { const d = decide(inspectRequest(req(h))); assert.equal(d.suspect, true); assert.equal(d.hold, true); }
    assert.equal(decide(inspectRequest(req(HUMAN, 'HEAD'))).hold, true);
    assert.equal(decide(inspectRequest(req(HUMAN, 'GET', { botManagement: { score: 5 } }))).hold, true);
  });
  test('two weak signals flag but never hold', () => {
    assert.equal(decide(inspectRequest(req({}))).suspect, false, 'no user agent alone is one weak signal');
    const d2 = decide(inspectRequest(req({ 'user-agent': 'Mozilla/5.0' }, 'GET', { botManagement: { score: 20, verifiedBot: false } })));
    assert.equal(d2.suspect, true); assert.equal(d2.hold, false);
  });
});

describe('the redirect', () => {
  test('OFF (default): exactly as before apart from search/cache headers; nothing is counted and no table is written', async () => {
    const env = await mkEnv(null); const { res, ev } = await go(env, { 'user-agent': 'python-requests/2.31' });
    assert.equal(res.status, 302); assert.match(res.headers.get('location'), /operator\.example\/go/); assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow'); assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(ev.is_bot, 0, 'not judged while off'); assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM go_click_velocity`).first()).c, 0);
  });
  test('FLAG: a visitor is redirected as normal and counted as human; automation is redirected but recorded as a bot with reasons', async () => {
    const env = await mkEnv('flag');
    const h = await go(env); assert.equal(h.res.status, 302); assert.equal(h.ev.is_bot, 0);
    const b = await go(env, { 'user-agent': 'curl/8.0', 'CF-Connecting-IP': '8.8.8.8' }); assert.equal(b.res.status, 302, 'flag mode never blocks');
    assert.equal(b.ev.is_bot, 1); assert.deepEqual(JSON.parse(b.ev.metadata).bot_signals, ['automation_agent', 'no_accept_language']);
  });
  test('HOLD: clear automation gets 403 and is still recorded; people and weak signals still pass', async () => {
    const env = await mkEnv('hold');
    assert.equal((await go(env)).res.status, 302);
    const b = await go(env, { 'user-agent': 'Go-http-client/1.1', 'CF-Connecting-IP': '7.7.7.7' }); assert.equal(b.res.status, 403); assert.equal(b.res.headers.get('location'), null); assert.equal(b.ev.is_bot, 1);
    assert.equal((await go(env, { 'CF-Connecting-IP': '6.6.6.6' })).res.status, 302, 'no user agent alone is flagged, not held');
  });
  test('rate limit: one visitor above the limit is flagged (and held in hold mode)', async () => {
    const env = await mkEnv('hold'); await env.DB.prepare(`INSERT INTO settings (key,value) VALUES ('go_bot_rate_limit','5')`).run(); shield.forgetShieldSettings(env.DB);
    const codes = []; for (let i = 0; i < 7; i++) codes.push((await go(env)).res.status);
    assert.deepEqual(codes, [302, 302, 302, 302, 302, 403, 403]);
    assert.equal((await go(env, { ...HUMAN, 'CF-Connecting-IP': '5.5.5.5' })).res.status, 302, 'another visitor is unaffected');
  });
  test('a database failure in the shield never breaks the redirect', async () => {
    const env = await mkEnv('flag'); const real = env.DB;
    env.DB = new Proxy(real, { get: (t, k) => (k === 'prepare' ? (sql) => (/go_click_velocity/.test(sql) ? { bind() { return { run: async () => { throw new Error('boom'); }, first: async () => { throw new Error('boom'); } }; } } : t.prepare(sql)) : t[k]) });
    assert.equal((await go(env)).res.status, 302);
  });
  test('goRedirect validates like Response.redirect', () => { assert.throws(() => goRedirect('not a url')); assert.equal(goRedirect('https://a.example').headers.get('location'), 'https://a.example/'); });
});

describe('robots.txt and the admin API', () => {
  test('robots.txt asks crawlers to skip tracked links only when protection is on', async () => {
    const { robots } = await import('../worker/controllers.js');
    for (const [mode, has] of [[null, false], ['flag', true]]) {
      const env = await mkEnv(mode); const txt = await (await robots(new Request(BASE + '/robots.txt'), env)).text();
      assert.equal(/Disallow: \/en\/go\//.test(txt), has); assert.match(txt, /User-agent: \*\nAllow: \//);
    }
  });
  test('admins only; validated; saved; audited', async () => {
    const { route } = await import('../worker/api/routes/settings.js'); const env = await mkEnv(null);
    const call = (method, body, user = { user_id: 1, role: 'admin' }) => route({ request: new Request(BASE + '/api/v1/settings/click-protection', { method, ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) }), env, path: '/api/v1/settings/click-protection', user });
    assert.equal((await call('GET', null, { user_id: 2, role: 'editor' })).status, 403);
    assert.equal((await call('POST', { mode: 'nuke' })).status, 400); assert.equal((await call('POST', { mode: 'flag', limit: 2 })).status, 400);
    assert.equal((await call('POST', { mode: 'hold', limit: 30 })).status, 200);
    assert.deepEqual(await (await call('GET')).json(), { mode: 'hold', limit: 30 });
  });
});
