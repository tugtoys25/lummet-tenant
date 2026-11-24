// test/newsroom-push.test.js -- web push: keys, VAPID signing, subscribing, batched sending, auto mode, service worker.
// Real migrated schema; the browser vendors' push servers are stubbed (fetch). Not covered: a real browser receiving a push.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as push from '../worker/newsroom-push.js';
import * as ops from '../worker/newsroom-ops.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import { renderNews } from '../worker/controllers.js';
import { resetNewsFlagCache } from '../worker/database/newsroom.js';
import { getRoute } from '../worker/routes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://news.example.com';
const ADMIN = { user_id: 1, role: 'admin' };
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,role) VALUES (1,'elie','Elie','Editor')`).run();
  const ins = `INSERT INTO news (id,slug,title,content,published,published_at,author_id,created_by,excerpt) VALUES (?,?,?,?,?,?,1,1,?)`;
  await db.prepare(ins).bind(10, 'live', 'Live story', '<p>Body</p>', 1, '2026-02-01 10:00:00', 's').run();
  await db.prepare(ins).bind(12, 'dr', 'Draft', '<p>d</p>', 0, null, 'd').run();
  const env = { DB: db, SITE_URL: BASE, ASSETS: { fetch: async (req) => { const f = join(ROOT, new URL(req.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8'), { status: 200 }) : new Response('', { status: 404 }); } } };
  resetNewsFlagCache(); ops.forgetOpsFlags(db);
  return env;
}
const flag = async (env, key, value = 'true') => { await env.DB.prepare(`INSERT INTO system_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(key, value).run(); resetNewsFlagCache(); ops.forgetOpsFlags(env.DB); };
const sub = (n) => ({ subscription: { endpoint: `https://push.example.net/send/${n}`, keys: { p256dh: 'p', auth: 'a' } } });
const api = async (env, method, route, body) => {
  const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body);
  const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, ADMIN);
  return { status: res.status, json: await res.json() };
};
async function ready(env) { await flag(env, 'news_web_push'); await push.setupVapid(env.DB, { contact: 'mailto:desk@example.com' }); }

describe('switches and keys', () => {
  test('ship off; nothing public while off; no button on articles', async () => {
    const env = await mkEnv();
    for (const k of ['news_web_push', 'news_push_auto']) assert.equal((await env.DB.prepare(`SELECT value FROM system_settings WHERE key=?`).bind(k).first()).value, 'false');
    assert.equal((await push.subscribe(env, sub(1))).status, 404);
    assert.equal(await push.renderPushButton(env.DB), '');
    assert.ok(!(await (await renderNews(new Request(`${BASE}/en/news/live`), env, 'live', null)).text()).includes('news-push.js'));
    assert.deepEqual(await push.runPushQueue(env), { skipped: true, reason: 'off' });
    const f = (await api(env, 'GET', 'flags')).json.flags; for (const k of ['news_web_push', 'news_push_auto']) assert.ok(f.find((x) => x.key === k)?.help);
  });
  test('key setup is idempotent; regenerating retires old subscriptions instead of deleting them', async () => {
    const env = await mkEnv(); await flag(env, 'news_web_push');
    const a = await push.setupVapid(env.DB, { contact: 'mailto:a@x.org' }); const b = await push.setupVapid(env.DB, {});
    assert.equal(a.created, true); assert.equal(b.created, false); assert.equal(a.publicKey, b.publicKey);
    assert.equal(fromB64u(a.publicKey).length, 65, 'uncompressed P-256 point');
    await push.subscribe(env, sub(1));
    const c = await push.setupVapid(env.DB, { regenerate: true });
    assert.notEqual(c.publicKey, a.publicKey);
    assert.equal((await env.DB.prepare(`SELECT status FROM news_push_subscriptions`).first()).status, 'gone');
  });
  test('the VAPID header is a valid ES256 JWT for the right audience, verifiable with the public key', async () => {
    const env = await mkEnv(); await ready(env);
    const h = await push.vapidHeaders(env.DB, 'https://push.example.net/send/abc');
    const m = h.Authorization.match(/^vapid t=([^,]+), k=(.+)$/); assert.ok(m);
    const [hd, pl, sg] = m[1].split('.');
    assert.equal(JSON.parse(atob(hd.replace(/-/g, '+').replace(/_/g, '/'))).alg, 'ES256');
    const claims = JSON.parse(atob(pl.replace(/-/g, '+').replace(/_/g, '/')));
    assert.equal(claims.aud, 'https://push.example.net'); assert.equal(claims.sub, 'mailto:desk@example.com'); assert.ok(claims.exp > Date.now() / 1000);
    const key = await crypto.subtle.importKey('raw', fromB64u(m[2]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64u(sg), new TextEncoder().encode(`${hd}.${pl}`)), true);
    assert.equal(h.TTL, '3600');
  });
});

describe('readers', () => {
  test('subscribe validates, is idempotent, and unsubscribe keeps the row', async () => {
    const env = await mkEnv(); await ready(env);
    assert.equal((await push.subscribe(env, { subscription: { endpoint: 'http://insecure.example/x' } })).status, 400);
    assert.equal((await push.subscribe(env, {})).status, 400);
    assert.equal((await push.subscribe(env, sub(1))).ok, true); await push.subscribe(env, sub(1));
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_push_subscriptions`).first()).c, 1);
    await push.unsubscribe(env, { endpoint: sub(1).subscription.endpoint });
    assert.equal((await env.DB.prepare(`SELECT status FROM news_push_subscriptions`).first()).status, 'unsubscribed');
    await push.subscribe(env, sub(1));
    assert.equal((await env.DB.prepare(`SELECT status FROM news_push_subscriptions`).first()).status, 'active', 'can opt back in');
  });
  test('the article shows the button and the service worker route exists only while on', async () => {
    const env = await mkEnv(); await ready(env);
    assert.ok((await (await renderNews(new Request(`${BASE}/en/news/live`), env, 'live', null)).text()).includes('news-push.js'));
    assert.deepEqual(getRoute(new Request(BASE + '/news-push-sw.js')), { type: 'robots', pushSw: true });
    assert.ok(push.SERVICE_WORKER_JS.includes("addEventListener('push'") && push.SERVICE_WORKER_JS.includes('/en/api/v1/news/push/latest'));
    assert.ok(!push.SERVICE_WORKER_JS.includes('e.data'), 'never trusts push data');
  });
});

describe('sending', () => {
  const stub = (codes = {}) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); return { status: codes[url] ?? 201 }; }; f.calls = calls; return f; };
  async function subs(env, n) { for (let i = 1; i <= n; i++) await push.subscribe(env, sub(i)); }

  test('announce needs a live article, blocks a repeat within a day, and records an audit entry', async () => {
    const env = await mkEnv(); await ready(env);
    assert.equal((await push.announce(env, { newsId: 12, actor: ADMIN, origin: BASE })).status, 404, 'draft');
    const r = await push.announce(env, { newsId: 10, actor: ADMIN, origin: BASE }); assert.equal(r.ok, true);
    assert.equal((await push.announce(env, { newsId: 10, actor: ADMIN, origin: BASE })).status, 409);
    assert.deepEqual({ ...(await push.latestAnnouncement(env.DB)) }, { title: 'Live story', url: `${BASE}/en/news/live` });
    assert.ok((await env.DB.prepare(`SELECT COUNT(*) c FROM audit_logs WHERE action='push_announced'`).first()).c === 1);
  });
  test('batches of 40: retires 410/404, counts failures, finishes, and sends empty signed requests', async () => {
    const env = await mkEnv(); await ready(env); await subs(env, 45);
    await push.announce(env, { newsId: 10, actor: ADMIN, origin: BASE });
    const f = stub({ 'https://push.example.net/send/3': 410, 'https://push.example.net/send/4': 404, 'https://push.example.net/send/5': 500 });
    const r1 = await push.runPushQueue(env, { fetchImpl: f });
    assert.deepEqual([r1.sent, r1.gone, r1.failed, r1.done], [37, 2, 1, false]);
    assert.ok(f.calls.every((c) => c.init.method === 'POST' && !c.init.body && /^vapid t=/.test(c.init.headers.Authorization)));
    const r2 = await push.runPushQueue(env, { fetchImpl: f });
    assert.deepEqual([r2.sent, r2.done], [5, true]);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_push_subscriptions WHERE status='gone'`).first()).c, 2);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_push_subscriptions`).first()).c, 45, 'nothing deleted');
    assert.equal((await push.runPushQueue(env, { fetchImpl: f })).sent, 0, 'nothing left');
    assert.equal(f.calls.length, 45);
  });
  test('a subscription that keeps failing is retired after five tries; one network error does not stop the batch', async () => {
    const env = await mkEnv(); await ready(env); await subs(env, 2);
    const boom = async (url) => { if (url.endsWith('/1')) throw new Error('network'); return { status: 201 }; };
    for (let i = 0; i < 5; i++) { await push.announce(env, { newsId: 10, actor: null, trigger: 'auto', origin: BASE }).catch(() => {}); await env.DB.prepare(`UPDATE news_push_sends SET done = 0, cursor = 0`).run(); const r = await push.runPushQueue(env, { fetchImpl: boom }); assert.equal(r.sent, 1); }
    assert.equal((await env.DB.prepare(`SELECT status FROM news_push_subscriptions WHERE endpoint LIKE '%/1'`).first()).status, 'gone');
  });
  test('admin API: status, setup permission, announce queues and sends the first batch', async () => {
    const env = await mkEnv(); await flag(env, 'news_web_push');
    assert.equal((await api(env, 'POST', 'push/announce', { news_id: 10 })).status, 400, 'no keys yet');
    assert.equal((await api(env, 'POST', 'push/setup', { contact: 'mailto:d@x.org' })).json.created, true);
    await push.subscribe(env, sub(1));
    const orig = globalThis.fetch; let hits = 0; globalThis.fetch = async () => { hits++; return { status: 201 }; };
    try { assert.equal((await api(env, 'POST', 'push/announce', { news_id: 10 })).json.success, true); } finally { globalThis.fetch = orig; }
    assert.equal(hits, 1);
    const st = (await api(env, 'GET', 'push/status')).json;
    assert.equal(st.configured, true); assert.equal(st.subscribers.active, 1); assert.equal(st.recent[0].sent, 1); assert.equal(st.live.length, 1); assert.ok(!JSON.stringify(st).includes('push_vapid_private'));
  });
  test('auto mode: only recent live stories, once each, capped per day, and only with both switches on', async () => {
    const env = await mkEnv(); await ready(env);
    const recent = (id, slug, mins) => env.DB.prepare(`INSERT INTO news (id,slug,title,content,published,published_at,author_id,created_by) VALUES (?,?,?,?,1,datetime('now', ?),1,1)`).bind(id, slug, 'T' + id, '<p>x</p>', `-${mins} minutes`).run();
    for (let i = 0; i < 5; i++) await recent(100 + i, 'r' + i, 10 + i);
    assert.equal((await push.runAutoAnnounce(env, { origin: BASE })).reason, 'off', 'needs news_push_auto');
    await flag(env, 'news_push_auto');
    assert.equal((await push.runAutoAnnounce(env, { origin: BASE })).announced, 3);
    assert.equal((await push.runAutoAnnounce(env, { origin: BASE })).announced, 0, 'daily cap');
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_push_sends WHERE news_id=10`).first()).c, 0, 'old story never auto-announced');
  });
});

describe('guards', () => {
  test('browser scripts avoid innerHTML', () => {
    for (const f of ['static/js/news-push.js', 'js-src/newsroom-admin/11-push-tools.js']) assert.ok(!/innerHTML/.test(readFileSync(join(ROOT, f), 'utf-8')), f);
  });
});
