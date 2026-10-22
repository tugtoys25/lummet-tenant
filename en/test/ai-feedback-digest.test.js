// v20.4: weekly chat-quality digest (admins only, no model call, nothing stored).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { handleAiStudio } from '../worker/ai/studio.js';
import { topicWords, groupTopics, chatQualityDigest } from '../worker/ai/digest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const makeReq = (method, url, body) => ({ method, url, headers: new Headers(), json: async () => body, cf: { country: 'KE' } });
const admin = { user_id: 1, role: 'admin' };
const editor = { user_id: 7, role: 'editor' };
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 19).replace('T', ' ');

describe('chat quality digest', () => {
  let db, env, calls;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db); calls = 0;
    env = { DB: db, AI: { run: async () => { calls++; return { response: '' }; } } };
    await db.prepare(`CREATE TABLE IF NOT EXISTS ai_rate_limits (ip_hash TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (ip_hash, created_at))`).run();
    await db.prepare(`INSERT INTO casinos (slug,name,website_url,affiliate_url,published,status,license) VALUES ('alpha-casino','Alpha Casino','https://a','https://a/x',1,'published','Malta MGA')`).run();
    const ins = (sid, ts, rating, reason, q, country, d) => db.prepare(`INSERT INTO ai_feedback (session_id, msg_ts, rating, reason, question, answer, country, created_at) VALUES (?,?,?,?,?,?,?,?)`).bind(sid, ts, rating, reason, q, q ? 'x' : null, country, ago(d)).run();
    await ins('s1-aaaaaaaa', 1, 'down', 'wrong', 'Tell me about Alpha Casino', 'KE', 1);
    await ins('s2-aaaaaaaa', 2, 'down', 'missing', 'Is Alpha Casino licensed?', 'KE', 2);
    await ins('s3-aaaaaaaa', 3, 'down', 'missing', 'zzyzx quantum llama farming', 'NG', 3);
    await ins('s4-aaaaaaaa', 4, 'up', null, null, 'KE', 2);
    await ins('s5-aaaaaaaa', 5, 'up', null, null, 'KE', 3);
    await ins('s6-aaaaaaaa', 6, 'down', 'wrong', 'older question', 'KE', 10);
    await ins('s7-aaaaaaaa', 7, 'up', null, null, 'KE', 9);
  });
  const get = (user, p = '/api/v1/ai-studio/feedback/digest') => handleAiStudio(makeReq('GET', `https://x.com${p}`), env, p, () => true, user);

  test('topic words drop filler and groups are counted greedily', () => {
    assert.deepEqual(topicWords('What is the best Casino in Kenya? 2024'), []);
    assert.deepEqual(topicWords('Tell me about Alpha Casino'), ['alpha']);
    const g = groupTopics([{ id: 1, question: 'Alpha payouts' }, { id: 2, question: 'alpha licence' }, { id: 3, question: 'llama farming' }]);
    assert.equal(g[0].topic, 'alpha'); assert.equal(g[0].count, 2); assert.equal(g[1].count, 1);
  });

  test('weeks, trend, countries, reasons and topics are computed; coverage is checked; no model call', async () => {
    const d = await chatQualityDigest(env, makeReq('GET', 'https://x.com/'));
    assert.equal(d.available, true);
    assert.deepEqual([d.this_week.up, d.this_week.down, d.this_week.helpful_pct], [2, 3, 40]);
    assert.deepEqual([d.last_week.up, d.last_week.down, d.last_week.helpful_pct], [1, 1, 50]);
    assert.equal(d.trend, -10);
    assert.ok(d.by_country.some((c) => c.country === 'NG' && c.down === 1));
    assert.ok(d.reasons.some((r) => r.reason === 'missing' && r.n === 2));
    const alpha = d.topics.find((t) => t.topic === 'alpha'); const llama = d.topics.find((t) => ['zzyzx', 'quantum', 'llama', 'farming'].includes(t.topic));
    assert.equal(alpha.count, 2); assert.equal(alpha.site_has_content, true);
    assert.equal(llama.site_has_content, false);
    assert.equal(calls, 0);
  });

  test('empty data and a missing table do not break', async () => {
    await db.prepare('DELETE FROM ai_feedback').run();
    const d = await chatQualityDigest(env, makeReq('GET', 'https://x.com/'));
    assert.equal(d.trend, null); assert.deepEqual(d.topics, []);
    await db.prepare('DROP TABLE ai_feedback').run();
    assert.deepEqual(await chatQualityDigest(env, makeReq('GET', 'https://x.com/')), { available: false });
  });

  test('route is admin only; the UI loads it without innerHTML', async () => {
    assert.equal((await get(editor)).status, 403);
    const r = await (await get(admin)).json(); assert.equal(r.success, true); assert.equal(r.available, true);
    const ui = read('static/js/ai-studio.js');
    assert.match(ui, /feedback\/digest/); assert.match(ui, /draftFix\(\{ id: t\.examples\[0\]\.id/); assert.ok(!/innerHTML/.test(ui));
  });
});
