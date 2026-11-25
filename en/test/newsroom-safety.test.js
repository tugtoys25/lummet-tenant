// test/newsroom-safety.test.js -- content backups and uptime / error alerts: switches, contents, privacy, retention, alert logic.
// Real migrated schema and real handlers; R2 and email are in-memory fakes. Not covered: real R2, real email delivery, real cron timing, restoring a backup.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as safety from '../worker/newsroom-safety.js';
import * as ops from '../worker/newsroom-ops.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import { resetNewsFlagCache } from '../worker/database/newsroom.js';

const BASE = 'https://news.example.com';
const ADMIN = { user_id: 1, role: 'admin' };

function fakeBucket() {
  const m = new Map();
  return { m, put: async (k, v) => { m.set(k, v); }, get: async (k) => (m.has(k) ? { body: m.get(k) } : null), delete: async (k) => { m.delete(k); } };
}
async function mkEnv(extra = {}) {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'admin@example.com','SECRET-HASH','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,role) VALUES (1,'elie','Elie','Editor')`).run();
  await db.prepare(`INSERT INTO news (id,slug,title,content,published,created_by) VALUES (1,'a','Alpha','<p>body</p>',1,1)`).run();
  await db.prepare(`INSERT INTO news_comments (news_id, author_name, author_email, body, status) VALUES (1,'Reader','reader@x.com','hi','approved')`).run().catch(() => {});
  const sent = [];
  const env = { DB: db, SITE_URL: BASE, MEDIA_BUCKET: fakeBucket(), RESEND_API_KEY: 'k', RESEND_FROM_EMAIL: 'f@example.com', ...extra };
  env.__sent = sent;
  resetNewsFlagCache(); ops.forgetOpsFlags(db);
  return env;
}
const flag = async (env, key, v = 'true') => { await env.DB.prepare(`INSERT INTO system_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(key, v).run(); resetNewsFlagCache(); ops.forgetOpsFlags(env.DB); };
const api = async (env, method, route, body) => {
  const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body || {});
  const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, ADMIN);
  return { status: res.status, res, json: res.headers.get('Content-Type')?.includes('json') ? await res.json() : null };
};
// Capture outgoing email by stubbing fetch (sendEmail posts to the email provider).
const withFetchStub = async (env, fn) => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (u, init) => { if (String(u).includes('resend')) { env.__sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: 'x' }), { status: 200 }); } return orig(u, init); };
  try { return await fn(); } finally { globalThis.fetch = orig; }
};

describe('backups', () => {
  test('ship OFF; backup refused while off', async () => {
    const env = await mkEnv();
    for (const k of ['news_backups', 'news_monitoring']) assert.equal((await env.DB.prepare(`SELECT value FROM system_settings WHERE key=?`).bind(k).first()).value, 'false');
    assert.equal((await api(env, 'POST', 'safety/backup')).status, 400);
    assert.deepEqual(await safety.runDailyBackup(env, new Date('2026-03-01T02:10:00Z')), { skipped: 'off' });
  });
  test('backup holds content, leaves out passwords, members and comments', async () => {
    const env = await mkEnv(); await flag(env, 'news_backups');
    const r = await api(env, 'POST', 'safety/backup'); assert.equal(r.status, 200);
    const [key, bytes] = [...env.MEDIA_BUCKET.m.entries()][0];
    assert.match(key, /^backups\/content\/.*-manual\.json\.gz$/);
    const text = gunzipSync(Buffer.from(bytes)).toString('utf-8');
    const dump = JSON.parse(text);
    assert.equal(dump.tables.news[0].title, 'Alpha'); assert.equal(dump.tables.authors[0].name, 'Elie');
    assert.ok(!('users' in dump.tables) && !('news_comments' in dump.tables) && !('news_members' in dump.tables));
    assert.ok(!text.includes('SECRET-HASH') && !text.includes('reader@x.com'));
  });
  test('daily run: only at the backup hour, once a day', async () => {
    const env = await mkEnv(); await flag(env, 'news_backups');
    assert.equal((await safety.runDailyBackup(env, new Date('2026-03-01T05:00:00Z'))).skipped, 'not the backup hour');
    assert.equal((await safety.runDailyBackup(env, new Date())).skipped, 'not the backup hour');
    const h = new Date(); h.setUTCHours(2, 5, 0, 0);
    assert.equal((await safety.runDailyBackup(env, h)).ok, true);
    assert.equal((await safety.runDailyBackup(env, h)).skipped, 'already done today');
  });
  test('keeps only the newest 14', async () => {
    const env = await mkEnv(); await flag(env, 'news_backups');
    for (let i = 0; i < 16; i++) await safety.runBackup(env, { kind: 'manual', now: new Date(Date.UTC(2026, 0, 1 + i)) });
    assert.equal((await safety.listBackups(env.DB)).length, 14); assert.equal(env.MEDIA_BUCKET.m.size, 14);
  });
  test('download returns the file; unknown id 404; not reachable under the public media prefix', async () => {
    const env = await mkEnv(); await flag(env, 'news_backups'); await api(env, 'POST', 'safety/backup');
    const id = (await safety.listBackups(env.DB))[0].id;
    const d = await api(env, 'GET', `safety/download?id=${id}`);
    assert.equal(d.status, 200); assert.equal(d.res.headers.get('Content-Type'), 'application/gzip');
    assert.equal((await api(env, 'GET', 'safety/download?id=999')).status, 404);
    assert.ok([...env.MEDIA_BUCKET.m.keys()].every((k) => !k.startsWith('media/')));
  });
  test('no storage connected: clear error, nothing thrown', async () => {
    const env = await mkEnv({ MEDIA_BUCKET: undefined }); await flag(env, 'news_backups');
    assert.equal((await api(env, 'POST', 'safety/backup')).status, 500);
  });
});

describe('monitoring', () => {
  test('health address is 404 while off, 200 when on, 503 when the database fails', async () => {
    const env = await mkEnv();
    assert.equal((await safety.healthResponse(env)).status, 404);
    await flag(env, 'news_monitoring');
    assert.equal((await safety.healthResponse(env)).status, 200);
    const broken = { ...env, DB: { prepare: (q) => (/system_settings/.test(q) ? env.DB.prepare(q) : { first: async () => { throw new Error('down'); } }) } };
    assert.equal((await safety.healthResponse(broken)).status, 503);
  });
  test('down then recovered: one email each, none while the state is unchanged', async () => {
    const env = await mkEnv(); await flag(env, 'news_monitoring');
    await withFetchStub(env, async () => {
      const bad = () => new Response('x', { status: 500 }), good = () => new Response('ok', { status: 200 });
      let r = await safety.runMonitor(env, { render: bad }); assert.equal(r.ok, false); assert.equal(env.__sent.length, 1); assert.match(env.__sent[0].subject, /ALERT/);
      await safety.runMonitor(env, { render: bad }); assert.equal(env.__sent.length, 1, 'still down: no repeat');
      r = await safety.runMonitor(env, { render: good }); assert.equal(r.ok, true); assert.equal(env.__sent.length, 2); assert.match(env.__sent[1].subject, /Recovered/);
      assert.deepEqual(env.__sent[0].to, ['admin@example.com']);
    });
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_health_checks`).first()).c, 3);
  });
  test('error spike alerts once per 6 hours; recording is off while switch is off', async () => {
    const env = await mkEnv();
    await safety.recordError(env, { path: '/x', message: 'boom' });
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_error_log`).first()).c, 0);
    await flag(env, 'news_monitoring');
    await safety.saveMonitorConfig(env.DB, { monitor_alert_email: 'ops@example.com', monitor_error_threshold: 3 });
    for (let i = 0; i < 3; i++) await safety.recordError(env, { path: '/en/news/x', message: 'boom' });
    await withFetchStub(env, async () => {
      await safety.runMonitor(env, { render: () => new Response('ok') });
      assert.equal(env.__sent.length, 1); assert.deepEqual(env.__sent[0].to, ['ops@example.com']); assert.match(env.__sent[0].subject, /3 server errors/);
      await safety.runMonitor(env, { render: () => new Response('ok') });
      assert.equal(env.__sent.length, 1, 'cooldown');
    });
  });
  test('error log is capped per minute', async () => {
    const env = await mkEnv(); await flag(env, 'news_monitoring');
    for (let i = 0; i < 60; i++) await safety.recordError(env, { path: '/p', message: 'm' });
    assert.ok((await env.DB.prepare(`SELECT COUNT(*) c FROM news_error_log`).first()).c <= 20);
  });
  test('config validation, status, test alert and flag help', async () => {
    const env = await mkEnv();
    assert.equal((await api(env, 'POST', 'safety/config', { monitor_alert_email: 'nope' })).status, 400);
    assert.equal((await api(env, 'POST', 'safety/config', { monitor_alert_email: 'a@b.co', monitor_error_threshold: 5 })).status, 200);
    const s = await api(env, 'GET', 'safety/status'); assert.equal(s.json.config.monitor_alert_email, 'a@b.co'); assert.match(s.json.health_url, /\/en\/api\/v1\/health$/);
    await withFetchStub(env, async () => { const t = await api(env, 'POST', 'safety/test-alert'); assert.equal(t.json.sent, 1); });
    const flags = (await api(env, 'GET', 'flags')).json.flags;
    for (const k of ['news_backups', 'news_monitoring']) assert.ok(flags.find((f) => f.key === k)?.help, k);
  });
});
