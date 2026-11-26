// test/news-reader.test.js -- polls, live blogs and AMP pages. Real migrated schema, real API handlers.
// Not covered: the browser behaviour (voting buttons, the 30 second refresh) and a real AMP validator run.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as reader from '../worker/newsroom-reader.js';
import { sanitizeForAmp, renderAmpPage } from '../worker/newsroom-amp.js';
import { renderNews } from '../worker/controllers.js';
import { renderNewsAmp } from '../worker/newsroom-amp-route.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import { publicRoutes } from '../worker/api/public.js';
import { resetNewsFlagCache } from '../worker/database/newsroom.js';
import { getRoute } from '../worker/routes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://news.example.com';
const ADMIN = { user_id: 1, role: 'admin' };
const NO_PERMS = { news: { read: true } };

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,role) VALUES (1,'elie','Elie','Editor')`).run();
  const ins = `INSERT INTO news (id,slug,title,content,published,published_at,author_id,created_by,excerpt) VALUES (?,?,?,?,?,?,1,1,?)`;
  await db.prepare(ins).bind(10, 'live-story', 'Live story', '<p>Hello <b>world</b></p><script>alert(1)</script><img src="https://x.test/a.jpg" alt="pic" onerror="x()"><iframe src="https://evil.test"></iframe><p style="color:red" onclick="y()">Styled <a href="javascript:alert(1)">bad</a> <a href="https://ok.test/p">good</a></p>', 1, '2026-02-01 10:00:00', 'ex').run();
  await db.prepare(ins).bind(12, 'draft-story', 'Draft', '<p>d</p>', 0, null, 'd').run();
  resetNewsFlagCache();
  return { DB: db, SITE_URL: BASE, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
}
const flag = async (env, ...k) => { await env.DB.prepare(`UPDATE system_settings SET value='true' WHERE key IN (${k.map(() => '?').join(',')})`).bind(...k).run(); resetNewsFlagCache(); };
const admin = async (env, method, route, body) => {
  const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body);
  const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, ADMIN);
  return { status: res.status, json: await res.json() };
};
const pub = async (env, method, path, body, ip = '1.1.1.1') => {
  const init = { method, headers: { 'cf-connecting-ip': ip, 'user-agent': 'UA', 'Content-Type': 'application/json' } }; if (body) init.body = JSON.stringify(body);
  const res = await publicRoutes({ request: new Request(BASE + path, init), env, path: path.split('?')[0], user: null });
  return { status: res.status, json: await res.json() };
};

describe('polls', () => {
  test('rules: 2-6 different options, a real question, future closing time, permission', async () => {
    const env = await mkEnv(); await flag(env, 'news_polls');
    const s = (o) => admin(env, 'POST', 'poll/save', { id: 10, question: o.question, options: o.options, closes_at: o.closesAt });
    assert.equal((await s({ question: 'hi', options: ['a', 'b'] })).status, 400);
    assert.equal((await s({ question: 'Which is best?', options: ['only one'] })).status, 400);
    assert.equal((await s({ question: 'Which is best?', options: ['A', 'a'] })).status, 400);
    assert.equal((await s({ question: 'Which is best?', options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })).status, 400);
    assert.equal((await s({ question: 'Which is best?', options: ['a', 'b'], closesAt: '2020-01-01T00:00:00Z' })).status, 400);
    assert.equal((await reader.savePoll(env.DB, { newsId: 10, question: 'Which is best?', options: ['a', 'b'], actor: ADMIN, perms: NO_PERMS })).status, 403);
  });
  test('one vote per reader; results add up; the poll must belong to a live story', async () => {
    const env = await mkEnv(); await flag(env, 'news_polls');
    assert.equal((await admin(env, 'POST', 'poll/save', { id: 10, question: 'Best fruit?', options: ['Mango', 'Pear'] })).status, 200);
    const poll = await reader.getPoll(env.DB, 10); const [mango, pear] = poll.options;
    const vote = (opt, ip) => pub(env, 'POST', '/api/v1/news/poll/vote', { poll: poll.id, option: opt, ip }, ip);
    assert.equal((await vote(mango.id, '9.9.9.1')).json.already, false);
    assert.equal((await vote(pear.id, '9.9.9.1')).json.already, true, 'a second vote from the same reader does not count');
    await vote(mango.id, '9.9.9.2'); await vote(pear.id, '9.9.9.3');
    const r = (await pub(env, 'GET', '/api/v1/news/poll?article=10')).json.poll;
    assert.equal(r.total, 3); assert.equal(r.options.find((o) => o.label === 'Mango').votes, 2); assert.equal(r.options.find((o) => o.label === 'Mango').pct, 67);
    assert.equal((await vote(99999, '9.9.9.4')).status, 400, 'an option from another poll is refused');
    const stored = await env.DB.prepare(`SELECT voter_hash FROM news_poll_votes LIMIT 1`).first();
    assert.ok(/^[0-9a-f]{64}$/.test(stored.voter_hash) && !stored.voter_hash.includes('9.9.9'), 'a salted hash is stored, never an address');
    await env.DB.prepare(`UPDATE news SET published = 0 WHERE id = 10`).run();
    assert.equal((await vote(mango.id, '9.9.9.5')).status, 404, 'an unpublished story takes no votes');
  });
  test('options lock after the first vote; closing keeps every vote; off switch hides the endpoints', async () => {
    const env = await mkEnv();
    assert.equal((await pub(env, 'POST', '/api/v1/news/poll/vote', { poll: 1, option: 1 })).status, 404, 'off by default');
    await flag(env, 'news_polls');
    await admin(env, 'POST', 'poll/save', { id: 10, question: 'Best fruit?', options: ['Mango', 'Pear'] });
    const p = await reader.getPoll(env.DB, 10);
    await pub(env, 'POST', '/api/v1/news/poll/vote', { poll: p.id, option: p.options[0].id });
    assert.equal((await admin(env, 'POST', 'poll/save', { id: 10, question: 'Best fruit?', options: ['Mango', 'Plum'] })).status, 409);
    assert.equal((await admin(env, 'POST', 'poll/save', { id: 10, question: 'Best fruit of all?', options: ['Mango', 'Pear'] })).status, 200, 'the question can still change');
    assert.equal((await admin(env, 'POST', 'poll/close', { id: 10 })).status, 200);
    const closed = await reader.getPoll(env.DB, 10);
    assert.equal(closed.closed, true); assert.equal(closed.total, 1, 'no vote was lost');
    const after = await pub(env, 'POST', '/api/v1/news/poll/vote', { poll: p.id, option: p.options[1].id }, '8.8.8.8');
    assert.equal(after.json.poll.total, 1, 'a closed poll takes no more votes');
  });
  test('the article page shows the poll only when the switch is on, with escaped text', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`INSERT INTO news_polls (id, news_id, question) VALUES (1,10,'<b>Q?</b> yes')`).run();
    await env.DB.prepare(`INSERT INTO news_poll_options (poll_id,label,position) VALUES (1,'A<script>',0),(1,'B',1)`).run();
    const get = async () => (await renderNews(new Request(`${BASE}/en/news/live-story`), env, 'live-story', null)).text();
    assert.ok(!/news-poll/.test(await get()));
    await flag(env, 'news_polls');
    const html = await get();
    assert.match(html, /data-poll="1"/); assert.ok(!/<b>Q\?<\/b>/.test(html) && !/A<script>/.test(html), 'question and options are escaped');
  });
});

describe('live blogs', () => {
  test('start, post, pin, edit, hide, end; nothing is ever deleted', async () => {
    const env = await mkEnv(); await flag(env, 'news_liveblog');
    const act = (op, extra) => admin(env, 'POST', 'live/act', { id: 10, op, ...extra });
    assert.equal((await act('post', { body: 'too early' })).status, 409, 'start first');
    assert.equal((await act('start')).status, 200);
    assert.equal((await act('post', { body: 'x' })).status, 400);
    await act('post', { body: 'First <b>update</b>\nline two' }); await act('post', { body: 'Second update' });
    const posts = (await admin(env, 'GET', 'live/get?id=10')).json.live.posts;
    assert.equal(posts.length, 2); assert.equal(posts[0].body, 'Second update', 'newest first'); assert.equal(posts[1].body, 'First update\nline two', 'markup is stripped');
    await act('pin', { post_id: posts[1].id });
    assert.equal((await reader.getLive(env.DB, 10)).posts[0].pinned, true, 'pinned posts lead');
    await act('edit', { post_id: posts[0].id, body: 'Second, corrected' });
    await act('hide', { post_id: posts[0].id });
    assert.equal((await reader.getLive(env.DB, 10)).posts.length, 1, 'hidden posts are not public');
    assert.equal((await reader.getLive(env.DB, 10, { includeHidden: true })).posts.length, 2, 'but they are still on record');
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news_live_posts`).first()).c, 2);
    await act('end'); assert.equal((await reader.getLive(env.DB, 10)).status, 'ended');
    assert.equal((await act('nonsense', { post_id: posts[0].id })).status, 400);
    assert.equal((await reader.liveAct(env.DB, { newsId: 10, op: 'post', body: 'hello', actor: ADMIN, perms: NO_PERMS })).status, 403);
  });
  test('public feed lists only visible updates, is off by default, and the page carries the block with structured data', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`INSERT INTO news_live (news_id) VALUES (10)`).run();
    await env.DB.prepare(`INSERT INTO news_live_posts (news_id, body, hidden) VALUES (10,'shown',0),(10,'secret',1)`).run();
    assert.equal((await pub(env, 'GET', '/api/v1/news/live?article=10')).status, 404, 'off by default');
    await flag(env, 'news_liveblog');
    const j = (await pub(env, 'GET', '/api/v1/news/live?article=10')).json;
    assert.deepEqual(j.posts.map((p) => p.body), ['shown']); assert.equal(j.status, 'live');
    assert.ok(!('hidden' in j.posts[0]));
    const html = await (await renderNews(new Request(`${BASE}/en/news/live-story`), env, 'live-story', null)).text();
    assert.match(html, /data-live="live"/); assert.match(html, /"@type":"LiveBlogPosting"/); assert.ok(!html.includes('secret'));
    assert.equal((await pub(env, 'GET', '/api/v1/news/live?article=12')).status, 404, 'a draft has no public feed');
  });
});

describe('AMP', () => {
  test('the sanitiser keeps text structure and drops everything AMP forbids', () => {
    const out = sanitizeForAmp('<p style="x" onclick="y()">Hi <b>there</b></p><script>bad()</script><style>p{}</style><iframe src="https://e"></iframe><img src="https://x.test/a.jpg" alt="pic&quot;" onerror="z()"><img src="javascript:alert(1)"><a href="javascript:alert(1)">no</a><a href="https://ok.test/?a=1&amp;b=2" target="_top" onclick="q()">yes</a><form><input></form><blink>old</blink>');
    assert.ok(!/script|style=|onclick|onerror|iframe|<form|<input|javascript:|blink/i.test(out), out);
    assert.match(out, /<p>Hi <b>there<\/b><\/p>/);
    assert.match(out, /<amp-img src="https:\/\/x\.test\/a\.jpg" alt="pic&quot;" width="1200" height="675" layout="responsive"><\/amp-img>/);
    assert.match(out, /<a href="https:\/\/ok\.test\/\?a=1&amp;b=2" rel="noopener">yes<\/a>/);
    assert.equal((out.match(/<amp-img/g) || []).length, 1, 'the javascript: image is dropped');
  });
  test('the page has the AMP essentials and escapes the title', () => {
    const html = renderAmpPage({ article: { title: 'A <b>"quoted"</b> title', content: '<p>x</p>', excerpt: 'e', published_at: '2026-02-01 10:00:00', featured_image_url: 'https://x.test/f.jpg' }, canonical: 'https://news.example.com/en/news/a', siteName: 'Site' });
    assert.match(html, /^<!doctype html>\n<html amp lang="en">/); assert.match(html, /<link rel="canonical" href="https:\/\/news\.example\.com\/en\/news\/a">/);
    assert.match(html, /cdn\.ampproject\.org\/v0\.js/); assert.match(html, /amp-boilerplate/); assert.match(html, /<style amp-custom>/);
    assert.ok(!html.includes('<b>"quoted"</b>')); assert.ok(html.length < 40000);
    assert.equal((html.match(/<script/g) || []).length, 2, 'only the AMP runtime and the structured data');
  });
  test('route is off by default, serves a published story when on, hides drafts, and the normal page advertises it', async () => {
    const env = await mkEnv();
    assert.deepEqual(getRoute(new Request(`${BASE}/en/amp/news/live-story`)), { type: 'newsAmp', slug: 'live-story' });
    const amp = (slug) => renderNewsAmp(new Request(`${BASE}/en/amp/news/${slug}`), env, slug);
    assert.equal((await amp('live-story')).status, 404, 'off by default');
    const page = async () => (await renderNews(new Request(`${BASE}/en/news/live-story`), env, 'live-story', null)).text();
    assert.ok(!/rel="amphtml"/.test(await page()));
    await flag(env, 'news_amp');
    const res = await amp('live-story'); assert.equal(res.status, 200);
    const html = await res.text(); assert.ok(!/alert\(1\)|onerror|iframe/.test(html)); assert.match(html, /<link rel="canonical" href="https:\/\/news\.example\.com\/en\/news\/live-story">/);
    assert.equal((await amp('draft-story')).status, 404); assert.equal((await amp('nope')).status, 404);
    assert.match(await page(), /<link rel="amphtml" href="https:\/\/news\.example\.com\/en\/amp\/news\/live-story">/);
  });
});

describe('browser script', () => {
  test('app.js has poll voting and live refresh', () => {
    const js = readFileSync(join(ROOT, 'static/js/app.js'), 'utf8');
    assert.match(js, /\/en\/api\/v1\/news\/poll\/vote/); assert.match(js, /\/en\/api\/v1\/news\/live\?article=/);
  });
});
