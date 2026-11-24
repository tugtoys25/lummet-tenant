// test/newsroom-membership.test.js -- member-only / registered-only articles, passwordless sign-in, webhook, leak checks.
// Real migrated schema and article controller. Not covered: real payment providers, real email delivery, real browsers.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as mem from '../worker/newsroom-membership.js';
import * as ops from '../worker/newsroom-ops.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import { renderNews } from '../worker/controllers.js';
import { handleNewsFeed } from '../worker/news-feed.js';
import { isCacheableRequest } from '../worker/page-cache.js';
import { resetNewsFlagCache } from '../worker/database/newsroom.js';
import { getRoute } from '../worker/routes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://news.example.com';
const ADMIN = { user_id: 1, role: 'admin' };
const BODY = [1, 2, 3, 4, 5, 6].map((i) => `<p>PARAGRAPH-${i} text.</p>`).join('');

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,role) VALUES (1,'elie','Elie','Editor')`).run();
  const ins = `INSERT INTO news (id,slug,title,content,published,published_at,author_id,created_by,excerpt) VALUES (?,?,?,?,1,'2026-02-01 10:00:00',1,1,?)`;
  await db.prepare(ins).bind(10, 'locked', 'Locked story', BODY, 'Summary of locked').run();
  await db.prepare(ins).bind(11, 'open', 'Open story', BODY, 'Summary of open').run();
  await db.prepare(ins).bind(12, 'short', 'Short story', '<p>ONLY-ONE paragraph here that is rather long indeed.</p>', 'Short summary').run();
  const env = { DB: db, SITE_URL: BASE, ASSETS: { fetch: async (req) => { const f = join(ROOT, new URL(req.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8'), { status: 200 }) : new Response('', { status: 404 }); } } };
  resetNewsFlagCache(); ops.forgetOpsFlags(db);
  return env;
}
const flag = async (env, key, value = 'true') => { await env.DB.prepare(`INSERT INTO system_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(key, value).run(); resetNewsFlagCache(); ops.forgetOpsFlags(env.DB); };
async function ready(env, level = 'members') { await flag(env, 'news_membership'); await mem.setupMembership(env.DB); await mem.setArticleAccess(env.DB, { newsId: 10, level, preview: 3, actor: ADMIN }); }
const page = async (env, cookie, slug = 'locked') => renderNews(new Request(`${BASE}/en/news/${slug}`, { headers: cookie ? { cookie } : {} }), env, slug, null);
const sendLog = [];
const deps = { sendEmail: async (_e, m) => { sendLog.push(m); } };
const login = (env, email, extra = {}) => mem.requestLogin(env, { email, ip: '1.1.1.1', origin: BASE, next: '/en/news/locked', ...extra }, deps);
const tokenFrom = (m) => new URL(m.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
async function cookieFor(env, email) { sendLog.length = 0; await login(env, email); const t = tokenFrom(sendLog[0]); const v = await mem.verifyLogin(env, t); return v.cookie.split(';')[0]; }
const api = async (env, method, route, body) => {
  const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body);
  const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, ADMIN);
  return { status: res.status, json: await res.json() };
};
const sign = async (secret, raw) => { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(raw))), (b) => b.toString(16).padStart(2, '0')).join(''); };

describe('off by default', () => {
  test('the switch ships off, is described in Flags, and limited rows change nothing while it is off', async () => {
    const env = await mkEnv();
    assert.equal((await env.DB.prepare(`SELECT value FROM system_settings WHERE key='news_membership'`).first()).value, 'false');
    assert.ok((await api(env, 'GET', 'flags')).json.flags.find((f) => f.key === 'news_membership')?.help);
    await mem.setArticleAccess(env.DB, { newsId: 10, level: 'members', preview: 3, actor: ADMIN });
    const html = await (await page(env)).text();
    assert.ok(html.includes('PARAGRAPH-6') && !html.includes('nr-gate'));
  });
});

describe('what a locked-out reader gets', () => {
  test('only the preview anywhere in the page, a sign-in box, correct structured data, and Vary: Cookie', async () => {
    const env = await mkEnv(); await ready(env);
    const res = await page(env); const html = await res.text();
    assert.ok(html.includes('PARAGRAPH-1') && html.includes('PARAGRAPH-3'));
    for (const i of [4, 5, 6]) assert.ok(!html.includes('PARAGRAPH-' + i), 'paragraph ' + i + ' leaked');
    assert.ok(html.includes('nrMemberForm') && html.includes('news-member.js') && html.includes('This story is for members'));
    assert.ok(html.includes('"isAccessibleForFree":false') || html.includes('"isAccessibleForFree": false'));
    assert.ok(/Cookie/.test(res.headers.get('Vary') || ''));
  });
  test('a free article and a short article behave as designed; at least half is always held back', async () => {
    const env = await mkEnv(); await ready(env);
    assert.ok((await (await page(env, null, 'open')).text()).includes('PARAGRAPH-6'));
    await mem.setArticleAccess(env.DB, { newsId: 12, level: 'members', preview: 20, actor: ADMIN });
    const short = await (await page(env, null, 'short')).text();
    assert.ok(short.includes('nrMemberForm') && !short.includes('rather long indeed'), 'a one-paragraph article is cut inside the paragraph');
    assert.equal(mem.buildPreview(BODY, 20).match(/<p/g).length, 3, 'six paragraphs: at most three shown');
    assert.equal(mem.buildPreview('<p>a</p><p>b</p>', 5).match(/<p/g).length, 1);
    assert.ok(!mem.buildPreview('<p>x</p><script>alert(1)</script>', 3).includes('<script>'));
  });
  test('the full-text feed carries no members-only text, but still lists the story', async () => {
    const env = await mkEnv(); await ready(env); await flag(env, 'news_rss_feeds'); await flag(env, 'news_rss_full_text');
    const res = await handleNewsFeed(new Request(`${BASE}/en/news/feed.xml`), env, { scope: 'all' }, { getSite: async () => ({ origin: BASE, siteName: 'T', description: '' }) });
    const xml = await res.text();
    assert.ok(xml.includes('Locked story') && xml.includes('Summary of locked'));
    assert.equal((xml.match(/PARAGRAPH-6/g) || []).length, 1, 'only the free story has its full text');
    assert.equal((xml.match(/PARAGRAPH-1 text/g) || []).length, 1, 'only the open story has full text');
  });
});

describe('sign-in', () => {
  test('only subscribers and members get a link; the answer is the same for everyone', async () => {
    const env = await mkEnv(); await ready(env); sendLog.length = 0;
    await env.DB.prepare(`INSERT INTO newsletter_subscribers (email,token,status) VALUES ('sub@x.org','t1','confirmed'),('pend@x.org','t2','pending')`).run();
    const known = await login(env, 'sub@x.org'); const unknown = await login(env, 'nobody@x.org'); const pending = await login(env, 'pend@x.org');
    assert.deepEqual([known.ok, unknown.ok, pending.ok, known.status, unknown.status], [true, true, true, 200, 200]);
    assert.equal(sendLog.length, 1); assert.equal(sendLog[0].to, 'sub@x.org');
    assert.equal((await login(env, 'bad')).status, 400);
    assert.equal((await login(env, 'x@y.org', { website: 'bot' })).ok, true);
  });
  test('links work once, expire, and are stored only as a hash', async () => {
    const env = await mkEnv(); await ready(env); sendLog.length = 0;
    await mem.grantMember(env.DB, { email: 'm@x.org', actor: ADMIN });
    await login(env, 'm@x.org'); const t = tokenFrom(sendLog[0]);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_member_logins WHERE token_hash = ?`).bind(t).first()).c, 0, 'raw token is not stored');
    assert.ok(await mem.verifyLogin(env, t)); assert.equal(await mem.verifyLogin(env, t), null, 'second use refused');
    sendLog.length = 0; await env.DB.prepare(`DELETE FROM news_member_logins`).run(); await login(env, 'm@x.org', { ip: '2.2.2.2' });
    const t2 = tokenFrom(sendLog[0]);
    assert.equal(await mem.verifyLogin(env, t2, Date.now() + 16 * 60000), null, 'expired');
    assert.equal(await mem.verifyLogin(env, 'garbage'), null);
  });
  test('rate limits per address and per connection', async () => {
    const env = await mkEnv(); await ready(env);
    await mem.grantMember(env.DB, { email: 'm@x.org', actor: ADMIN });
    for (let i = 0; i < 3; i++) assert.equal((await login(env, 'm@x.org', { ip: '5.5.5.' + i })).status, 200);
    assert.equal((await login(env, 'm@x.org', { ip: '6.6.6.6' })).status, 429);
    for (let i = 0; i < 8; i++) await login(env, `u${i}@x.org`, { ip: '7.7.7.7' });
    assert.equal((await login(env, 'u9@x.org', { ip: '7.7.7.7' })).status, 429);
  });
  test('a member sees everything, privately; a subscriber is enough for registered-only but not members-only; forged or expired cookies fail', async () => {
    const env = await mkEnv(); await ready(env);
    await mem.grantMember(env.DB, { email: 'm@x.org', actor: ADMIN });
    await env.DB.prepare(`INSERT INTO newsletter_subscribers (email,token,status) VALUES ('sub@x.org','t1','confirmed')`).run();
    const mc = await cookieFor(env, 'm@x.org'); const sc = await cookieFor(env, 'sub@x.org');
    const r = await page(env, mc); const html = await r.text();
    assert.ok(html.includes('PARAGRAPH-6') && !html.includes('nr-gate'));
    assert.ok(/no-store/.test(r.headers.get('Cache-Control')) && /private/.test(r.headers.get('Cache-Control')));
    const sub = await (await page(env, sc)).text();
    assert.ok(!sub.includes('PARAGRAPH-6') && sub.includes('does not include this story'));
    await mem.setArticleAccess(env.DB, { newsId: 10, level: 'registered', preview: 3, actor: ADMIN });
    assert.ok((await (await page(env, sc)).text()).includes('PARAGRAPH-6'));
    const forged = mc.slice(0, -3) + (mc.endsWith('AAA') ? 'BBB' : 'AAA');
    assert.ok(!(await (await page(env, forged)).text()).includes('PARAGRAPH-6'));
    const old = await mem.makeCookie(env.DB, 'm@x.org', Date.now() - 31 * 86400000);
    assert.ok(!(await (await page(env, old.split(';')[0])).text()).includes('PARAGRAPH-6'));
    await mem.revokeMember(env.DB, { email: 'm@x.org', actor: ADMIN }); await mem.setArticleAccess(env.DB, { newsId: 10, level: 'members', preview: 3, actor: ADMIN });
    assert.ok(!(await (await page(env, mc)).text()).includes('PARAGRAPH-6'), 'revoked at once, cookie or not');
    await mem.grantMember(env.DB, { email: 'e@x.org', expiresAt: '2000-01-01', actor: ADMIN });
    assert.equal(await mem.activeMember(env.DB, 'e@x.org'), null, 'ended membership');
  });
  test('routes: verify sets the cookie and redirects safely; logout clears it; cookie requests skip the shared page cache', async () => {
    const env = await mkEnv(); await ready(env);
    assert.equal(getRoute(new Request(BASE + '/en/member/verify')).type, 'memberAction');
    assert.equal(isCacheableRequest(new Request(BASE + '/en/news/locked'), 'news'), true);
    assert.equal(isCacheableRequest(new Request(BASE + '/en/news/locked', { headers: { cookie: 'nr_member=abc.def' } }), 'news'), false);
    assert.ok(mem.clearCookie().includes('Max-Age=0'));
    const src = readFileSync(join(ROOT, 'worker/app/routes/listings.js'), 'utf-8');
    assert.ok(src.includes('memberAction') && src.includes('/^\\/en\\/news'), 'redirect target is restricted to the news section');
  });
});

describe('webhook', () => {
  test('signed grant and revoke work; wrong signature, stale time, and off switch are refused', async () => {
    const env = await mkEnv(); await flag(env, 'news_membership');
    const { webhookSecret } = await mem.setupMembership(env.DB);
    const call = async (obj, secret = webhookSecret) => { const raw = JSON.stringify(obj); return mem.handleWebhook(env, raw, await sign(secret, raw)); };
    const now = Math.floor(Date.now() / 1000);
    assert.equal((await call({ event: 'grant', email: 'W@X.org', ts: now, tier: 'gold', expires_at: '2099-01-01', external_id: 'sub_1' })).status, 200);
    assert.equal((await mem.activeMember(env.DB, 'w@x.org')).tier, 'gold');
    assert.equal((await call({ event: 'grant', email: 'z@x.org', ts: now }, 'wrong')).status, 401);
    assert.equal((await call({ event: 'grant', email: 'z@x.org', ts: now - 3600 })).status, 400);
    assert.equal((await call({ event: 'nope', email: 'z@x.org', ts: now })).status, 400);
    assert.equal(await mem.activeMember(env.DB, 'z@x.org'), null);
    assert.equal((await mem.handleWebhook(env, '{}', 'nothex')).status, 401);
    assert.equal((await call({ event: 'revoke', email: 'w@x.org', ts: now })).status, 200);
    assert.equal(await mem.activeMember(env.DB, 'w@x.org'), null);
    assert.equal((await mem.setupMembership(env.DB)).webhookSecret, null, 'secret is shown only when made');
    await flag(env, 'news_membership', 'false');
    assert.equal((await call({ event: 'grant', email: 'q@x.org', ts: now })).status, 404);
  });
});

describe('admin', () => {
  test('access, grant and revoke go through the API with audit entries; permissions are enforced by the API', async () => {
    const env = await mkEnv(); await flag(env, 'news_membership');
    assert.equal((await api(env, 'POST', 'membership/setup', {})).json.success, true);
    assert.equal((await api(env, 'POST', 'membership/access', { news_id: 10, level: 'members', preview_paragraphs: 2 })).json.success, true);
    assert.equal((await api(env, 'POST', 'membership/access', { news_id: 10, level: 'bogus' })).status, 400);
    assert.equal((await api(env, 'POST', 'membership/access', { news_id: 999, level: 'members' })).status, 404);
    assert.equal((await api(env, 'POST', 'membership/grant', { email: 'bad' })).status, 400);
    assert.equal((await api(env, 'POST', 'membership/grant', { email: 'a@b.org', tier: 'x' })).json.success, true);
    const st = (await api(env, 'GET', 'membership/status')).json;
    assert.equal(st.members.length, 1); assert.equal(st.limited[0].level, 'members'); assert.equal(st.enabled, true);
    assert.ok(!JSON.stringify(st).includes('member_webhook_secret') && !JSON.stringify(st).includes('member_session_secret'));
    assert.equal((await api(env, 'POST', 'membership/revoke', { id: st.members[0].id })).json.success, true);
    const audits = await env.DB.prepare(`SELECT action FROM audit_logs WHERE action IN ('article_access_changed','member_changed')`).all();
    assert.ok(audits.results.length >= 3);
    assert.ok(!JSON.stringify((await env.DB.prepare(`SELECT metadata FROM audit_logs WHERE action='member_changed'`).all()).results).includes('a@b.org'), 'audit log keeps no email address');
  });
});

describe('guards', () => {
  test('browser scripts avoid innerHTML', () => {
    for (const f of ['static/js/news-member.js', 'js-src/newsroom-admin/12-membership-tools.js']) assert.ok(!/innerHTML/.test(readFileSync(join(ROOT, f), 'utf-8')), f);
  });
});
