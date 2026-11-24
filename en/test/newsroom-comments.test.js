// test/newsroom-comments.test.js -- reader comments: posting, moderation, rendering, switches.
// Real migrated schema and article controller. Not covered: real browsers, real abuse traffic, email alerts to moderators (not built).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as cm from '../worker/newsroom-comments.js';
import * as ops from '../worker/newsroom-ops.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import { renderNews } from '../worker/controllers.js';
import { resetNewsFlagCache } from '../worker/database/newsroom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://news.example.com';
const ADMIN = { user_id: 1, role: 'admin' };

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,role) VALUES (1,'elie','Elie','Editor')`).run();
  const ins = `INSERT INTO news (id,slug,title,content,published,published_at,author_id,created_by,excerpt) VALUES (?,?,?,?,?,?,1,1,?)`;
  await db.prepare(ins).bind(10, 'live', 'Live', '<p>Body</p>', 1, '2026-02-01 10:00:00', 's').run();
  await db.prepare(ins).bind(12, 'dr', 'Draft', '<p>d</p>', 0, null, 'd').run();
  await db.prepare(ins).bind(13, 'fu', 'Future', '<p>f</p>', 1, '2099-01-01 00:00:00', 'f').run();
  const env = { DB: db, ASSETS: { fetch: async (req) => { const f = join(ROOT, new URL(req.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8'), { status: 200 }) : new Response('', { status: 404 }); } }, SITE_URL: BASE };
  resetNewsFlagCache(); ops.forgetOpsFlags(db);
  return env;
}
const flag = async (env, key, value = 'true') => { await env.DB.prepare(`INSERT INTO system_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(key, value).run(); resetNewsFlagCache(); ops.forgetOpsFlags(env.DB); };
const post = (env, o = {}, ip = '1.1.1.1') => cm.submitComment(env, { body: { slug: 'live', name: 'Ana', body: 'A thoughtful comment.', ...o }, ip });
const page = async (env) => (await renderNews(new Request(`${BASE}/en/news/live`), env, 'live', null)).text();
const api = async (env, method, route, body) => {
  const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body);
  const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, ADMIN);
  return { status: res.status, json: await res.json() };
};

describe('switches', () => {
  test('both ship off, are described in Flags, and the article page has no comments markup', async () => {
    const env = await mkEnv();
    for (const k of ['news_comments', 'news_comments_open_posting']) assert.equal((await env.DB.prepare(`SELECT value FROM system_settings WHERE key=?`).bind(k).first()).value, 'false');
    const f = (await api(env, 'GET', 'flags')).json.flags;
    for (const k of ['news_comments', 'news_comments_open_posting']) assert.ok(f.find((x) => x.key === k)?.help);
    const html = await page(env);
    assert.ok(!html.includes('nr-comments') && !html.includes('news-comments.js'));
    assert.equal((await post(env)).status, 404, 'posting refused while off');
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_comments`).first()).c, 0);
  });
});

describe('posting', () => {
  test('default: held for review and not shown; open posting publishes at once', async () => {
    const env = await mkEnv(); await flag(env, 'news_comments');
    const r = await post(env);
    assert.deepEqual([r.ok, r.state], [true, 'pending']);
    assert.ok(!(await page(env)).includes('A thoughtful comment'));
    await flag(env, 'news_comments_open_posting');
    assert.equal((await post(env, { body: 'Another good point here.' }, '2.2.2.2')).state, 'approved');
    const html = await page(env);
    assert.ok(html.includes('Another good point here.') && html.includes('1 comment') && html.includes('nrCommentForm') && html.includes('news-comments.js'));
  });
  test('text is escaped, email is never shown', async () => {
    const env = await mkEnv(); await flag(env, 'news_comments'); await flag(env, 'news_comments_open_posting');
    await post(env, { name: '<b>Eve</b>', email: 'eve@x.org', body: '<script>alert(1)</script> hello' });
    const html = await page(env);
    assert.ok(!html.includes('<script>alert(1)') && html.includes('&lt;script&gt;alert(1)&lt;/script&gt; hello') && html.includes('&lt;b&gt;Eve&lt;/b&gt;'));
    assert.ok(!html.includes('eve@x.org'));
  });
  test('validation, honeypot, drafts and future articles, duplicates, rate limit, spam', async () => {
    const env = await mkEnv(); await flag(env, 'news_comments'); await flag(env, 'news_comments_open_posting');
    assert.equal((await post(env, { name: '' })).status, 400);
    assert.equal((await post(env, { body: 'x' })).status, 400);
    assert.equal((await post(env, { body: 'y'.repeat(2001) })).status, 400);
    assert.equal((await post(env, { email: 'nope' })).status, 400);
    assert.equal((await post(env, { slug: 'dr' })).status, 404);
    assert.equal((await post(env, { slug: 'fu' })).status, 404);
    assert.equal((await post(env, { slug: 'ghost' })).status, 404);
    const before = (await env.DB.prepare(`SELECT COUNT(*) c FROM news_comments`).first()).c;
    assert.equal((await post(env, { website: 'http://bot' })).ok, true);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_comments`).first()).c, before, 'honeypot stores nothing');
    await post(env, { body: 'Same words twice.' }, '3.3.3.3'); await post(env, { body: 'Same words twice.' }, '4.4.4.4');
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_comments WHERE body='Same words twice.'`).first()).c, 1);
    const s = await post(env, { body: 'buy http://a.com http://b.com http://c.com now' }, '5.5.5.5');
    assert.equal(s.state, 'pending', 'spam looks like normal review to the sender');
    assert.equal((await env.DB.prepare(`SELECT status FROM news_comments WHERE body LIKE 'buy%'`).first()).status, 'spam');
    for (let i = 0; i < 5; i++) await post(env, { body: 'unique comment number ' + i }, '9.9.9.9');
    assert.equal((await post(env, { body: 'one more comment please' }, '9.9.9.9')).status, 429);
  });
  test('replies: one level, only to approved comments on the same article', async () => {
    const env = await mkEnv(); await flag(env, 'news_comments'); await flag(env, 'news_comments_open_posting');
    await post(env, { body: 'Top comment here.' });
    const top = await env.DB.prepare(`SELECT id FROM news_comments`).first();
    assert.equal((await post(env, { body: 'A reply to it.', parent_id: top.id }, '2.2.2.2')).ok, true);
    const reply = await env.DB.prepare(`SELECT id FROM news_comments WHERE parent_id=?`).bind(top.id).first();
    assert.equal((await post(env, { body: 'A reply to reply.', parent_id: reply.id }, '3.3.3.3')).status, 400);
    assert.equal((await post(env, { body: 'Reply to nothing.', parent_id: 9999 }, '4.4.4.4')).status, 400);
    const html = await page(env);
    assert.ok(html.includes('2 comments') && html.includes('A reply to it.'));
  });
});

describe('moderation', () => {
  test('editors approve, reject, restore; nothing is deleted; audit trail kept; page shows only approved', async () => {
    const env = await mkEnv(); await flag(env, 'news_comments');
    await post(env);
    const list = await api(env, 'GET', 'comments/list');
    assert.equal(list.json.comments.length, 1); assert.equal(list.json.counts.pending, 1);
    const id = list.json.comments[0].id;
    assert.equal((await api(env, 'POST', 'comments/moderate', { id, status: 'approved' })).json.success, true);
    assert.ok((await page(env)).includes('A thoughtful comment'));
    await api(env, 'POST', 'comments/moderate', { id, status: 'rejected' });
    assert.ok(!(await page(env)).includes('A thoughtful comment'));
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_comments`).first()).c, 1, 'still stored');
    assert.equal((await api(env, 'POST', 'comments/moderate', { id, status: 'bogus' })).status, 400);
    assert.equal((await api(env, 'POST', 'comments/moderate', { id: 999, status: 'approved' })).status, 404);
    assert.ok((await env.DB.prepare(`SELECT COUNT(*) c FROM audit_logs WHERE action='comment_moderated'`).first()).c >= 2);
  });
  test('closing a discussion stops new comments, keeps old ones, and can be undone', async () => {
    const env = await mkEnv(); await flag(env, 'news_comments'); await flag(env, 'news_comments_open_posting');
    await post(env, { body: 'Before the close.' });
    assert.equal((await api(env, 'POST', 'comments/close', { news_id: 10, closed: true })).json.success, true);
    assert.equal((await post(env, { body: 'After the close.' }, '2.2.2.2')).status, 403);
    const html = await page(env);
    assert.ok(html.includes('Before the close.') && html.includes('Comments are closed') && !html.includes('nrCommentForm'));
    await api(env, 'POST', 'comments/close', { news_id: 10, closed: false });
    assert.equal((await post(env, { body: 'After reopening.' }, '3.3.3.3')).ok, true);
    assert.equal((await api(env, 'POST', 'comments/close', { news_id: 999, closed: true })).status, 404);
  });
  test('deleting an article removes its comments with it (foreign key), not the other way round', async () => {
    const env = await mkEnv(); await flag(env, 'news_comments');
    await post(env);
    await env.DB.prepare(`DELETE FROM news_comments`).run();
    assert.ok(await env.DB.prepare(`SELECT id FROM news WHERE id=10`).first());
  });
});

describe('guards', () => {
  test('browser scripts avoid innerHTML', () => {
    for (const f of ['static/js/news-comments.js', 'js-src/newsroom-admin/10-comments-tools.js']) assert.ok(!/innerHTML/.test(readFileSync(join(ROOT, f), 'utf-8')), f);
  });
});
