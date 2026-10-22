// v21.2: Content gaps -- thumbs-down topics the site has nothing on, each one a thing worth writing.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { handleAiStudio } from '../worker/ai/studio.js';
import { contentGaps } from '../worker/ai/digest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const makeReq = (method, url, body) => ({ method, url, headers: new Headers(), json: async () => body, cf: { country: 'KE' } });
const admin = { user_id: 1, role: 'admin' };
const editor = { user_id: 7, role: 'editor' };
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 19).replace('T', ' ');

describe('content gaps', () => {
  let db, env, calls;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db); calls = 0;
    env = { DB: db, AI: { run: async () => { calls++; return { response: '' }; } } };
    await db.prepare(`CREATE TABLE IF NOT EXISTS ai_rate_limits (ip_hash TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (ip_hash, created_at))`).run();
    await db.prepare(`INSERT INTO casinos (slug,name,website_url,affiliate_url,published,status,license) VALUES ('alpha-casino','Alpha Casino','https://a','https://a/x',1,'published','Malta MGA')`).run();
    const ins = (sid, ts, q, reviewed, d) => db.prepare(`INSERT INTO ai_feedback (session_id, msg_ts, rating, reason, question, answer, country, reviewed, created_at) VALUES (?,?, 'down','missing',?,'x','KE',?,?)`).bind(sid, ts, q, reviewed, ago(d)).run();
    await ins('s1-aaaaaaaa', 1, 'Tell me about Alpha Casino', 0, 1);
    await ins('s2-aaaaaaaa', 2, 'zzyzx quantum llama farming', 0, 2);
    await ins('s3-aaaaaaaa', 3, 'is zzyzx farming legal', 0, 3);
    await ins('s4-aaaaaaaa', 4, 'wibble wobble handled already', 1, 3);
    await ins('s5-aaaaaaaa', 5, 'zork frobnicate ancient question', 0, 90);
  });
  const get = (user, p = '/api/v1/ai-studio/feedback/gaps') => handleAiStudio(makeReq('GET', `https://x.com${p}`), env, p, () => true, user);

  test('only topics the site has nothing on are listed, with every related question counted', async () => {
    const d = await contentGaps(env, makeReq('GET', 'https://x.com/'));
    assert.equal(d.available, true);
    const topics = d.gaps.map((g) => g.topic);
    assert.ok(!topics.includes('alpha'), 'covered topic is not a gap');
    const g = d.gaps.find((x) => x.examples.some((e) => /zzyzx/.test(e.question)));
    assert.ok(g, 'zzyzx is a gap'); assert.equal(g.count, 2); assert.equal(g.ids.length, 2);
    assert.ok(!JSON.stringify(d).includes('wibble'), 'already handled'); assert.ok(!JSON.stringify(d).includes('zork'), 'too old');
    assert.equal(calls, 0);
  });

  test('a topic is only a gap when both the topic word and the question find nothing', async () => {
    const seen = [];
    const d = await contentGaps(env, makeReq('GET', 'https://x.com/'), { retrieveFn: async (_e, text) => { seen.push(text); return text.includes('farming') ? { news: [{ id: 1 }] } : {}; } });
    assert.ok(!d.gaps.some((g) => g.examples.some((e) => /llama/.test(e.question))), 'question hit means covered');
    assert.ok(seen.length >= 2);
  });

  test('handled items disappear after being marked reviewed; empty and missing table are fine', async () => {
    const before = (await contentGaps(env, makeReq('GET', 'https://x.com/'))).gaps.find((g) => g.ids && g.count === 2);
    for (const id of before.ids) await handleAiStudio(makeReq('POST', 'https://x.com/api/v1/ai-studio/feedback/review', { id, reviewed: true }), env, '/api/v1/ai-studio/feedback/review', () => true, admin);
    assert.ok(!(await contentGaps(env, makeReq('GET', 'https://x.com/'))).gaps.some((g) => g.count === 2));
    await db.prepare('DROP TABLE ai_feedback').run();
    assert.deepEqual(await contentGaps(env, makeReq('GET', 'https://x.com/')), { available: false, gaps: [] });
  });

  test('route is admin only; the tab offers research, news and handled, without innerHTML', async () => {
    assert.equal((await get(editor)).status, 403);
    const r = await (await get(admin)).json(); assert.equal(r.success, true); assert.ok(Array.isArray(r.gaps));
    const ui = read('static/js/ai-studio.js');
    for (const t of ['feedback/gaps', 'Content gaps', 'Research draft', 'News article draft', 'Mark as handled']) assert.ok(ui.includes(t), t);
    assert.ok(!/innerHTML/.test(ui));
  });
});
