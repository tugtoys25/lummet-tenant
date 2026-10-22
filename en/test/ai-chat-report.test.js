// v21.3: weekly chat-quality email to admins who opted in.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { handleAiStudio } from '../worker/ai/studio.js';
import { getRecipients, sendChatQualityReport } from '../worker/ai/report.js';
import { runChatQualityReport } from '../worker/cron.js';
import { readIndexSource } from './support/index-source.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const makeReq = (method, url, body) => ({ method, url, headers: new Headers(), json: async () => body, cf: { country: 'KE' } });
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 19).replace('T', ' ');

describe('weekly chat-quality report', () => {
  let db, env, sent, realFetch;
  const admin = { user_id: 1, role: 'admin' };
  const editor = { user_id: 3, role: 'editor' };
  beforeEach(async () => {
    realFetch = globalThis.fetch; sent = [];
    globalThis.fetch = async (url, opt) => { sent.push(JSON.parse(opt.body)); return new Response('{"id":"m1"}', { status: 200 }); };
    db = createTestDb(); applyMigrations(db);
    env = { DB: db, SITE_URL: 'https://site.test', RESEND_API_KEY: 'k', RESEND_FROM_EMAIL: 'a@site.test', AI: { run: async () => { throw new Error('no model'); } } };
    await db.prepare(`CREATE TABLE IF NOT EXISTS ai_rate_limits (ip_hash TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (ip_hash, created_at))`).run();
    for (const [id, email, role] of [[1, 'one@site.test', 'admin'], [2, 'two@site.test', 'admin'], [3, 'ed@site.test', 'editor']]) await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (?,?,?,?)`).bind(id, email, 'x', role).run();
    const ins = (sid, ts, rating, q, d) => db.prepare(`INSERT INTO ai_feedback (session_id, msg_ts, rating, reason, question, answer, country, created_at) VALUES (?,?,?,?,?,?, 'KE', ?)`).bind(sid, ts, rating, rating === 'down' ? 'missing' : null, q, q ? 'x' : null, ago(d)).run();
    await ins('s1-aaaaaaaa', 1, 'down', 'zzyzx <script>alert(1)</script> farming', 1);
    await ins('s2-aaaaaaaa', 2, 'up', null, 2);
  });
  afterEach(() => { globalThis.fetch = realFetch; });
  const call = (user, method, body) => handleAiStudio(makeReq(method, 'https://site.test/x', body), env, '/api/v1/ai-studio/feedback/report', () => true, user);

  test('each admin turns it on or off for themselves; editors cannot', async () => {
    assert.equal((await call(editor, 'GET')).status, 403);
    await call(admin, 'POST', { enabled: true });
    await call({ user_id: 2, role: 'admin' }, 'POST', { enabled: true });
    assert.deepEqual(await getRecipients(db), [1, 2]);
    const me = await (await call(admin, 'GET')).json(); assert.equal(me.enabled, true); assert.equal(me.recipients, 2); assert.equal(me.email_ready, true);
    await call(admin, 'POST', { enabled: false });
    assert.deepEqual(await getRecipients(db), [2]);
  });

  test('"send me one now" goes only to the person asking, with numbers, a gap, escaped visitor text and a link', async () => {
    const r = await (await call(admin, 'POST', { send_now: true })).json();
    assert.equal(r.sent, 1); assert.equal(sent.length, 1); assert.deepEqual(sent[0].to, ['one@site.test']);
    assert.match(sent[0].html, /50% helpful/); assert.match(sent[0].html, /zzyzx/); assert.match(sent[0].html, /https:\/\/site\.test\/en\/dashboard\/ai-studio/);
    assert.ok(!sent[0].html.includes('<script>alert(1)</script>')); assert.match(sent[0].html, /&lt;script&gt;/);
  });

  test('people who are no longer admins are skipped, and nothing is sent when there is nothing to report', async () => {
    await db.prepare(`INSERT INTO settings (key, value) VALUES ('ai_chat_report_to', '[1,3]')`).run();
    const r = await sendChatQualityReport(env, null);
    assert.equal(r.sent, 1); assert.deepEqual(sent.map((m) => m.to[0]), ['one@site.test']);
    sent.length = 0; await db.prepare('DELETE FROM ai_feedback').run();
    const e = await sendChatQualityReport(env, null);
    assert.equal(e.skipped, true); assert.equal(sent.length, 0);
  });

  test('the scheduled job does nothing without opt-ins, then sends once a week', async () => {
    assert.equal((await runChatQualityReport(env)).skipped, true);
    assert.equal(await db.prepare(`SELECT value FROM system_settings WHERE key = 'chat_quality_report_last_attempt_at'`).first(), null);
    await call(admin, 'POST', { enabled: true });
    const a = await runChatQualityReport(env); assert.equal(a.sent, 1);
    const b = await runChatQualityReport(env); assert.equal(b.skipped, true); assert.match(b.reason, /due again at 7d/);
    assert.equal(sent.length, 1);
  });

  test('a mail problem is reported, never thrown; the page, scheduler and docs are wired', async () => {
    env.RESEND_API_KEY = '';
    const r = await sendChatQualityReport(env, null, { onlyUserId: 1 });
    assert.equal(r.failed, 1); assert.match(r.error, /RESEND_API_KEY/);
    assert.match(readIndexSource(), /runChatQualityReport\(env\)/);
    const ui = read('static/js/ai-studio.js');
    for (const t of ['feedback/report', 'Email me this report every week', 'Send me one now']) assert.ok(ui.includes(t), t);
    assert.ok(!/innerHTML/.test(ui));
  });
});
