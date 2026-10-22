// v20.2: thumbs up/down on Lummet AI answers, an admin review tab, and the migration workflow.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { handleAPI } from '../worker/api.js';
import { handleAiStudio } from '../worker/ai/studio.js';
import { readApiSource } from './support/api-source.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const makeReq = (method, url, body) => ({ method, url, headers: new Headers(), json: async () => body, cf: { country: 'KE' } });
const admin = { user_id: 1, role: 'admin', email: 'a@test.com' };
const editor = { user_id: 7, role: 'editor' };
const SID = 'session-abc-12345';

describe('feedback', () => {
  let db, env, pub, studio;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db);
    await db.prepare(`CREATE TABLE IF NOT EXISTS ai_conversations (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, user_id INTEGER, messages TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS ai_rate_limits (ip_hash TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (ip_hash, created_at))`).run();
    const msgs = [{ role: 'user', content: 'Is Alpha Casino legal in Kenya?', ts: 1000 }, { role: 'assistant', content: 'It depends on the licence.', ts: 1001 }];
    await db.prepare(`INSERT INTO ai_conversations (id, session_id, messages) VALUES ('c1', ?, ?)`).bind(SID, JSON.stringify(msgs)).run();
    env = { DB: db };
    pub = (b) => handleAPI(makeReq('POST', 'https://x.com/api/v1/ai/feedback', b), env, '/api/v1/ai/feedback', null);
    studio = (user) => (m, p, b) => handleAiStudio(makeReq(m, `https://x.com${p}`, b), env, p.split('?')[0], () => true, user);
  });
  const j = (r) => r.json();

  test('a visitor who is not logged in can rate; thumbs-down keeps text read from the saved chat, not from the browser', async () => {
    const r = await pub({ session_id: SID, rating: 'down', reason: 'wrong', question: 'FORGED', answer: 'FORGED' });
    assert.equal(r.status, 200);
    const row = await db.prepare('SELECT * FROM ai_feedback').first();
    assert.equal(row.rating, 'down'); assert.equal(row.reason, 'wrong'); assert.equal(row.country, 'KE'); assert.equal(row.msg_ts, 1001);
    assert.equal(row.question, 'Is Alpha Casino legal in Kenya?'); assert.equal(row.answer, 'It depends on the licence.');
  });

  test('thumbs-up stores no text; changing your mind updates the same row', async () => {
    await pub({ session_id: SID, rating: 'up', reason: 'ignored' });
    let row = await db.prepare('SELECT * FROM ai_feedback').first();
    assert.equal(row.rating, 'up'); assert.equal(row.question, null); assert.equal(row.answer, null); assert.equal(row.reason, null);
    await pub({ session_id: SID, rating: 'down' });
    await pub({ session_id: SID, rating: 'down', reason: 'missing' });
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM ai_feedback').first()).n, 1);
    row = await db.prepare('SELECT * FROM ai_feedback').first();
    assert.equal(row.rating, 'down'); assert.equal(row.reason, 'missing');
  });

  test('bad requests, unknown sessions and a missing table are handled', async () => {
    assert.equal((await pub({ session_id: SID, rating: 'meh' })).status, 400);
    assert.equal((await pub({ session_id: 'x', rating: 'up' })).status, 400);
    assert.equal((await pub({ session_id: 'unknown-session-1', rating: 'up' })).status, 404);
    await db.prepare('DROP TABLE ai_feedback').run();
    const r = await pub({ session_id: SID, rating: 'up' });
    assert.equal(r.status, 200); assert.equal((await j(r)).stored, false);
  });

  test('rating is rate limited per visitor', async () => {
    let last;
    for (let n = 0; n < 31; n++) last = await pub({ session_id: SID, rating: 'up' });
    assert.equal(last.status, 429);
  });

  test('old thumbs-down rows are removed when a new one is saved', async () => {
    await db.prepare(`INSERT INTO ai_feedback (session_id, msg_ts, rating, created_at) VALUES ('old-session-1', 1, 'down', '2020-01-01 00:00:00')`).run();
    await pub({ session_id: SID, rating: 'down' });
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM ai_feedback WHERE session_id = 'old-session-1'`).first()).n, 0);
  });

  test('admins see a summary and the thumbs-down list; they can mark items reviewed', async () => {
    await pub({ session_id: SID, rating: 'down', reason: 'wrong' });
    await db.prepare(`INSERT INTO ai_feedback (session_id, msg_ts, rating) VALUES ('s2-session-xyz', 5, 'up'), ('s3-session-xyz', 6, 'up')`).run();
    const a = studio(admin);
    const d = await j(await a('GET', '/api/v1/ai-studio/feedback?rating=down&reviewed=0'));
    assert.equal(d.summary.up, 2); assert.equal(d.summary.down, 1); assert.equal(d.summary.unreviewed_down, 1); assert.deepEqual(d.summary.reasons, [{ reason: 'wrong', n: 1 }]);
    assert.equal(d.rows.length, 1); assert.match(d.rows[0].question, /Alpha Casino/);
    assert.equal((await j(await a('POST', '/api/v1/ai-studio/feedback/review', { id: d.rows[0].id, reviewed: true }))).success, true);
    assert.equal((await j(await a('GET', '/api/v1/ai-studio/feedback?rating=down&reviewed=0'))).rows.length, 0);
    assert.equal((await j(await a('GET', '/api/v1/ai-studio/feedback?rating=down&reviewed=1'))).rows.length, 1);
    assert.equal((await a('POST', '/api/v1/ai-studio/feedback/review', { id: 9999, reviewed: true })).status, 404);
  });

  test('only admins can read feedback; the tab is offered only to them; missing table says so', async () => {
    assert.equal((await studio(editor)('GET', '/api/v1/ai-studio/feedback')).status, 403);
    assert.equal((await studio(editor)('POST', '/api/v1/ai-studio/feedback/review', { id: 1 })).status, 403);
    assert.equal((await j(await studio(admin)('GET', '/api/v1/ai-studio/meta'))).feedback, true);
    assert.equal((await j(await studio(editor)('GET', '/api/v1/ai-studio/meta'))).feedback, false);
    await db.prepare('DROP TABLE ai_feedback').run();
    assert.equal((await j(await studio(admin)('GET', '/api/v1/ai-studio/feedback'))).summary.available, false);
  });
});

describe('wiring', () => {
  test('widget shows thumbs only after a successful answer, builds them without innerHTML, and sends no text', () => {
    const js = read('static/js/lummet-ai.js');
    assert.match(js, /function addFeedbackRow/); assert.match(js, /\/en\/api\/v1\/ai\/feedback/);
    assert.equal((js.match(/addFeedbackRow\(\);/g) || []).length, 3, 'two non-stream paths + stream path');
    const fn = js.slice(js.indexOf('function addFeedbackRow'), js.indexOf('function addFollowUpSuggestions'));
    assert.ok(!/innerHTML/.test(fn));
    assert.match(js, /if \(!failed\) addFeedbackRow/);
    assert.match(read('static/css/lummet-ai.css'), /\.lummet-fb-btn/);
  });
  test('public path list, route and migration exist', () => {
    const api = readApiSource();
    assert.match(api, /"\/api\/v1\/ai\/chat\/clear",\s*"\/api\/v1\/ai\/feedback"/);
    const sql = read('migrations/0004_ai_history_feedback_perf.sql');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS ai_feedback/);
    const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS ai_feedback ('), sql.indexOf(');', sql.indexOf('CREATE TABLE IF NOT EXISTS ai_feedback (')));
    assert.ok(!/user_id|ip_hash/.test(table), 'nothing identifying is stored');
  });
});
