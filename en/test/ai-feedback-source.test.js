// v21.1: ratings remember which entrance they came from (floating widget or the lummet.<domain> page).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { handleFeedback, feedbackSource } from '../worker/ai/feedback.js';
import { handleLummetRequest } from '../worker/lummet/router.js';
import { chatQualityDigest } from '../worker/ai/digest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const mk = (url, body, ip = '1.2.3.4') => ({ method: 'POST', url, headers: new Headers({ 'CF-Connecting-IP': ip }), json: async () => body, cf: { country: 'KE' } });
const SID = 'session-abc-12345';

describe('feedback source', () => {
  let db, env;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db);
    await db.prepare(`CREATE TABLE IF NOT EXISTS ai_conversations (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, user_id INTEGER, messages TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS ai_rate_limits (ip_hash TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (ip_hash, created_at))`).run();
    const msgs = [{ role: 'user', content: 'Is Alpha legal?', ts: 1000 }, { role: 'assistant', content: 'Depends.', ts: 1001 }];
    for (const s of [SID, 'other-session-98765']) await db.prepare(`INSERT INTO ai_conversations (id, session_id, messages) VALUES (?, ?, ?)`).bind('c' + s, s, JSON.stringify(msgs)).run();
    env = { DB: db, ASSETS: { fetch: async () => new Response('x') } };
  });
  const src = async (sid) => (await db.prepare('SELECT source FROM ai_feedback WHERE session_id = ?').bind(sid).first()).source;

  test('the server decides the entrance from the address, not from anything the browser sends', async () => {
    assert.equal(feedbackSource(mk('https://lummet.site.test/api/feedback')), 'subdomain');
    assert.equal(feedbackSource(mk('https://site.test/en/api/v1/ai/feedback')), 'widget');
    assert.equal(feedbackSource({ url: 'not a url' }), 'widget');
    await handleFeedback(mk('https://site.test/en/api/v1/ai/feedback', { session_id: SID, rating: 'up', source: 'subdomain' }), env);
    assert.equal(await src(SID), 'widget');
  });

  test('the lummet. page route records subdomain', async () => {
    await handleLummetRequest(mk('https://lummet.site.test/api/feedback', { session_id: 'other-session-98765', rating: 'down', reason: 'wrong' }), env, {});
    assert.equal(await src('other-session-98765'), 'subdomain');
  });

  test('before migration 0064 ratings are still saved', async () => {
    await db.prepare('ALTER TABLE ai_feedback DROP COLUMN source').run();
    const r = await handleFeedback(mk('https://site.test/en/api/v1/ai/feedback', { session_id: SID, rating: 'down', reason: 'missing' }), env);
    assert.equal(r.status, 200);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM ai_feedback').first()).n, 1);
    const d = await chatQualityDigest(env, mk('https://x.com/'), { checkCoverage: false });
    assert.equal(d.available, true); assert.deepEqual(d.by_source, []);
  });

  test('the digest compares the entrances', async () => {
    await handleFeedback(mk('https://site.test/en/api/v1/ai/feedback', { session_id: SID, rating: 'up' }), env);
    await handleFeedback(mk('https://lummet.site.test/api/feedback', { session_id: 'other-session-98765', rating: 'down', reason: 'wrong' }), env);
    const d = await chatQualityDigest(env, mk('https://x.com/'), { checkCoverage: false });
    const by = Object.fromEntries(d.by_source.map((x) => [x.source, x]));
    assert.equal(by.widget.helpful_pct, 100); assert.equal(by.subdomain.helpful_pct, 0);
  });

  test('the table has the source column; the digest shows it without innerHTML', () => {
    assert.match(read('migrations/0004_ai_history_feedback_perf.sql'), /ai_feedback \([^;]*\n  source TEXT/);
    const ui = read('static/js/ai-studio.js');
    assert.match(ui, /by_source/); assert.ok(!/innerHTML/.test(ui));
  });
});
