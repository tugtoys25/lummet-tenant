// v21.0: the lummet.<domain> page and the floating widget are two faces of ONE public chat.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { handleAPI } from '../worker/api.js';
import { handleLummetRequest } from '../worker/lummet/router.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const mk = (method, url, body, country = 'KE', ip = '1.2.3.4') => ({
  method, url, headers: new Headers({ 'CF-Connecting-IP': ip, cookie: '' }), json: async () => body, cf: { country },
});

describe('subdomain and widget share one chat', () => {
  let db, env, aiCalls;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db); aiCalls = 0;
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS ai_conversations (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, user_id INTEGER, messages TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS ai_rate_limits (ip_hash TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (ip_hash, created_at))`,
    ]) await db.prepare(sql).run();
    await db.prepare(`INSERT INTO casinos (slug,name,website_url,affiliate_url,published,status,license) VALUES ('alpha-casino','Alpha Casino','https://a','https://a/x',1,'published','Malta MGA')`).run();
    env = {
      DB: db,
      ASSETS: { fetch: async () => new Response('<html>{{site_name}}</html>', { headers: { 'content-type': 'text/html' } }) },
      AI: { run: async (_m, o) => { aiCalls++; env.lastPrompt = JSON.stringify(o.messages); return { response: 'Alpha Casino holds a Malta MGA licence.' }; } },
    };
  });
  const widget = (path, body, country) => handleAPI(mk('POST', `https://site.test/en${path}`, body, country), env, path, null);
  const sub = (path, body, country) => handleLummetRequest(mk('POST', `https://lummet.site.test${path}`, body, country), env, {});

  test('the same question gets the same answer from both entrances, and both remember it', async () => {
    const a = await (await widget('/api/v1/ai/chat', { message: 'Tell me about Alpha Casino', session_id: 'widget-session-1' })).json();
    const b = await (await sub('/api/chat', { message: 'Tell me about Alpha Casino', session_id: 'lummet-session-1' }, 'KE')).json();
    assert.equal(a.success, true); assert.equal(b.success, true);
    assert.equal(a.answer, b.answer);
    for (const sid of ['widget-session-1', 'lummet-session-1']) {
      const row = await db.prepare('SELECT messages FROM ai_conversations WHERE session_id = ?').bind(sid).first();
      assert.ok(row && JSON.parse(row.messages).length >= 2, sid);
    }
  });

  test('the subdomain sees the same site content as the widget (retrieval is shared)', async () => {
    await sub('/api/chat', { message: 'Tell me about Alpha Casino', session_id: 'lummet-session-2' });
    assert.match(env.lastPrompt, /Alpha Casino/); assert.match(env.lastPrompt, /Malta MGA/);
  });

  test('bad input and rate limits behave the same on both', async () => {
    for (const call of [widget.bind(null, '/api/v1/ai/chat'), sub.bind(null, '/api/chat')]) {
      assert.equal((await call({ message: '' })).status, 400);
      assert.equal((await call({ message: 'x'.repeat(501) })).status, 400);
    }
  });

  test('thumbs feedback works from the subdomain and lands in the same table as the widget', async () => {
    await sub('/api/chat', { message: 'Tell me about Alpha Casino', session_id: 'lummet-session-3' });
    const r = await sub('/api/feedback', { session_id: 'lummet-session-3', rating: 'down', reason: 'missing' });
    assert.equal(r.status, 200);
    const row = await db.prepare(`SELECT * FROM ai_feedback WHERE session_id = 'lummet-session-3'`).first();
    assert.equal(row.rating, 'down'); assert.equal(row.reason, 'missing'); assert.equal(row.country, 'KE');
    assert.match(row.question, /Alpha Casino/);
    assert.equal((await sub('/api/feedback', { session_id: 'x', rating: 'meh' })).status, 400);
  });

  test('New Chat on the subdomain clears the saved conversation like the widget does', async () => {
    await sub('/api/chat', { message: 'Tell me about Alpha Casino', session_id: 'lummet-session-4' });
    const r = await sub('/api/chat/clear', { session_id: 'lummet-session-4' });
    assert.equal((await r.json()).success, true);
    const row = await db.prepare(`SELECT messages FROM ai_conversations WHERE session_id = 'lummet-session-4'`).first();
    assert.ok(!row || JSON.parse(row.messages || '[]').length === 0);
  });

  test('the page itself and its assets are still served; other hosts are not captured', async () => {
    const home = await handleLummetRequest(mk('GET', 'https://lummet.site.test/'), env, {});
    assert.equal(home.status, 200); assert.match(await home.text(), /<html>/);
    assert.equal(await handleLummetRequest(mk('GET', 'https://site.test/'), env, {}), null);
  });

  test('the page has the same feedback wording and reasons as the widget, with no innerHTML in the new code', () => {
    const page = read('lummet/index.html'), widgetJs = read('static/js/lummet-ai.js');
    for (const t of ['Was this helpful?', 'What was wrong?', 'Incorrect', 'Missing info', 'Unclear', 'Something else', "'wrong'", "'missing'", "'unclear'", "'other'"]) {
      assert.ok(page.includes(t) && widgetJs.includes(t), t);
    }
    const fn = page.slice(page.indexOf('function addFeedbackRow'), page.indexOf('function addMessage'));
    assert.ok(fn.length > 200 && !/innerHTML/.test(fn));
    assert.match(page, /'\/api\/feedback'/); assert.match(page, /'\/api\/chat\/clear'/);
    assert.equal((page.match(/addFeedbackRow\(\)/g) || []).length >= 3, true);
  });
});
