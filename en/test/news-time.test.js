// test/news-time.test.js -- publish day + time on cards and the article page, and the date / time search filters.
// Real migrated schema, the real article controller and templates, and the real search query.
// Not covered: the browser script that localises the time (js-src/app/06-news-time.js) and CSS.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderNews, renderNewsList } from '../worker/controllers.js';
import { renderTime, isMateriallyUpdated, toIso, utcText } from '../worker/news-time.js';
import { renderArticleCard, renderDateSummary } from '../worker/newsroom-render.js';
import { searchNews, parseSearchParams, hasSearchFilters, dateRange, tzOffset } from '../worker/newsroom-search.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name) VALUES (1,'elie','Elie')`).run();
  return { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
}
const flags = (env, keys) => env.DB.prepare(`UPDATE system_settings SET value='true' WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).run();
let seq = 900;
// published_at is stored the way the app stores it: UTC, 'YYYY-MM-DD HH:MM:SS'.
const article = async (env, publishedAt, { updatedAt = null, slug } = {}) => {
  const id = ++seq;
  await env.DB.prepare(`INSERT INTO news (id,slug,title,content,published,published_at,created_at,updated_at,author_id,created_by,excerpt) VALUES (?,?,?,?,1,?,?,?,1,1,'ex')`)
    .bind(id, slug || `a-${id}`, `Title ${id}`, '<p>body</p>', publishedAt, publishedAt, updatedAt || publishedAt).run();
  return id;
};
const params = (qs) => parseSearchParams(new URLSearchParams(qs));
const ids = async (env, qs, opts = {}) => (await searchNews(env.DB, params(qs), { pageSize: 50, ...opts })).articles.map((a) => a.id).sort();

describe('time markup', () => {
  test('renderTime writes an ISO datetime and a readable UTC fallback with day, date and time', () => {
    assert.equal(renderTime('2026-11-24 20:05:00'),
      '<time class="news-time" datetime="2026-11-24T20:05:00.000Z" data-news-time="card">Tue, 24 Nov 2026 · 20:05 UTC</time>');
    assert.match(renderTime('2026-11-24T20:05:00Z', 'article'), /data-news-time="article">Tuesday, 24 November 2026 at 20:05 UTC</);
    assert.match(renderTime('2026-11-24 20:05:00', 'card', { className: 'news-date' }), /class="news-time news-date"/);
  });
  test('a missing or unreadable date renders nothing, and the markup never carries newsroom-only classes', () => {
    for (const bad of [null, undefined, '', 'not a date']) assert.equal(renderTime(bad), '');
    assert.ok(!/\bnr-/.test(renderTime('2026-11-24 20:05:00')), 'legacy pages must not get nr- classes');
    assert.equal(toIso('2026-11-24 20:05:00'), '2026-11-24T20:05:00.000Z');
    assert.equal(utcText('2026-01-05T07:03:00.000Z'), 'Mon, 5 Jan 2026 · 07:03 UTC');
  });
  test('"Updated" is only worth showing when it is at least an hour after publishing', () => {
    assert.equal(isMateriallyUpdated('2026-11-24 20:05:00', '2026-11-24 20:30:00'), false);
    assert.equal(isMateriallyUpdated('2026-11-24 20:05:00', '2026-11-24 21:05:00'), true);
    assert.equal(isMateriallyUpdated('2026-11-24 20:05:00', null), false);
  });
  test('a newsroom card shows the day and time instead of a bare date', () => {
    const html = renderArticleCard({ slug: 's', title: 'T', published_at: '2026-11-24 20:05:00' });
    assert.match(html, /<time class="news-time" datetime="2026-11-24T20:05:00.000Z" data-news-time="card">Tue, 24 Nov 2026 · 20:05 UTC<\/time>/);
  });
});

describe('article page header', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });
  const page = async (slug) => (await renderNews(new Request(`https://site.test/en/news/${slug}`), env, slug, null)).text();

  test('shows when it was published (day, date, time) and omits "Updated" when nothing changed', async () => {
    await article(env, '2026-11-24 20:05:00', { slug: 'fresh' });
    const html = await page('fresh');
    assert.match(html, /<strong>Published:<\/strong> <time class="news-time" datetime="2026-11-24T20:05:00.000Z" data-news-time="article">Tuesday, 24 November 2026 at 20:05 UTC<\/time>/);
    assert.ok(!html.includes('<strong>Updated:</strong>'));
  });
  test('shows "Updated" with its own time once the article was changed later', async () => {
    await article(env, '2026-11-24 20:05:00', { slug: 'edited', updatedAt: '2026-11-25 09:30:00' });
    const html = await page('edited');
    assert.match(html, /<strong>Updated:<\/strong> <time class="news-time" datetime="2026-11-25T09:30:00.000Z" data-news-time="article">Wednesday, 25 November 2026 at 09:30 UTC<\/time>/);
  });
});

describe('date and time search filters', () => {
  let env, a, b, c, d;
  beforeEach(async () => {
    env = await mkEnv();
    a = await article(env, '2026-11-24 22:30:00');   // Tue late evening UTC  (= Wed 00:30 in Kigali, UTC+2)
    b = await article(env, '2026-11-24 09:15:00');   // Tue morning UTC
    c = await article(env, '2026-11-23 12:00:00');   // Mon noon
    d = await article(env, '2026-11-10 08:00:00');   // two weeks earlier
  });
  const NOW = Date.parse('2026-11-24T23:00:00Z');   // Tue 23:00 UTC = Wed 01:00 in Kigali

  test('a single day (day=) matches that calendar day only', async () => {
    assert.deepEqual(await ids(env, 'day=2026-11-24'), [a, b].sort());
    assert.deepEqual(await ids(env, 'day=2026-11-23'), [c]);
  });
  test('from / to is an inclusive range', async () => {
    assert.deepEqual(await ids(env, 'from=2026-11-23&to=2026-11-24'), [a, b, c].sort());
    assert.deepEqual(await ids(env, 'from=2026-11-24'), [a, b].sort());
    assert.deepEqual(await ids(env, 'to=2026-11-10'), [d]);
  });
  test('presets follow the READER\'s calendar (tzo = minutes east of UTC)', async () => {
    assert.deepEqual(await ids(env, 'range=today', { now: NOW }), [a, b].sort(), 'UTC reader: today is Tue 24th');
    assert.deepEqual(await ids(env, 'range=today&tzo=120', { now: NOW }), [a], 'Kigali reader: it is already Wed 25th, and only the 22:30 UTC article (00:30 local) is from today');
    assert.deepEqual(await ids(env, 'range=yesterday&tzo=120', { now: NOW }), [b], '...so "yesterday" is Tue 24th local: the 09:15 UTC article only');
    assert.deepEqual(await ids(env, 'range=7d', { now: NOW }), [a, b, c].sort());
    assert.deepEqual(await ids(env, 'range=30d', { now: NOW }), [a, b, c, d].sort());
    assert.deepEqual(await ids(env, 'range=month', { now: NOW }), [a, b, c, d].sort());
  });
  test('a date filter in the reader\'s timezone moves the day boundary', async () => {
    // 22:30 UTC on the 24th is 00:30 on the 25th in Kigali.
    assert.deepEqual(await ids(env, 'day=2026-11-25&tzo=120'), [a]);
    assert.deepEqual(await ids(env, 'day=2026-11-25'), []);
    assert.deepEqual(await ids(env, 'day=2026-11-24&tzo=-300'), [a, b].sort(), 'New York (UTC-5): 22:30 UTC is 17:30 on the 24th');
  });
  test('time of day matches the clock in the reader\'s timezone, including windows that cross midnight', async () => {
    assert.deepEqual(await ids(env, 'from_time=09:00&to_time=10:00'), [b]);
    assert.deepEqual(await ids(env, 'from_time=11:00&to_time=13:00'), [c]);
    assert.deepEqual(await ids(env, 'from_time=09:00&to_time=10:00&tzo=120'), [d], '09:15 UTC is 11:15 in Kigali (out); 08:00 UTC is 10:00 there (in, bounds are inclusive)');
    assert.deepEqual(await ids(env, 'from_time=11:00&to_time=12:00&tzo=120'), [b]);
    assert.deepEqual(await ids(env, 'from_time=22:00&to_time=02:00'), [a], 'night window wraps past midnight');
    assert.deepEqual(await ids(env, 'day=2026-11-24&from_time=20:00'), [a], 'day and time combine');
  });
  test('bad values match nothing instead of being ignored', async () => {
    for (const qs of ['day=2026-13-45', 'from=nope', 'range=forever', 'from_time=25:00', 'to_time=9am']) {
      const r = await searchNews(env.DB, params(qs), { pageSize: 50 });
      assert.equal(r.total, 0, qs); assert.ok(r.invalid_filters.length, qs);
    }
  });
  test('helpers: presets, offsets, and what counts as a filter', () => {
    assert.deepEqual(dateRange('7d', 0, NOW), { from: '2026-11-18', to: '2026-11-24' });
    assert.deepEqual(dateRange('month', 120, NOW), { from: '2026-11-01', to: '2026-11-25' });
    assert.equal(dateRange('nope'), null);
    assert.equal(tzOffset('120'), 120); assert.equal(tzOffset('-300'), -300); assert.equal(tzOffset('99999'), 0); assert.equal(tzOffset('x'), 0);
    for (const qs of ['range=today', 'day=2026-11-24', 'from_time=09:00', 'to_time=10:00']) assert.ok(hasSearchFilters(params(qs)), qs);
    assert.ok(!hasSearchFilters(params('tzo=120')), 'the timezone alone is not a filter');
  });
});

describe('date filters on the news page', () => {
  test('the results page says which dates are shown and offers a way back; pagination keeps the filters', async () => {
    const env = await mkEnv(); await flags(env, ['news_v2_homepage', 'news_search_v2']);
    await article(env, '2026-11-24 09:15:00', { slug: 'morning' });
    const r = await renderNewsList(new Request('https://site.test/en/news?day=2026-11-24&from_time=09:00&to_time=10:00&tzo=0'), env);
    const html = await r.text();
    assert.match(html, /Showing:<\/span> <span class="nr-active__chip">On 24 Nov 2026, published between 09:00 and 10:00<\/span> <a href="\/en\/news">Clear date filters<\/a>/);
    assert.match(html, /\/en\/news\/morning/);
  });
  test('summary wording', () => {
    assert.match(renderDateSummary({ range: '7d' }), />Last 7 days</);
    assert.match(renderDateSummary({ from: '2026-11-01', to: '2026-11-24' }), />1 Nov 2026 to 24 Nov 2026</);
    assert.match(renderDateSummary({ from: '2026-11-01' }, '/en/news?q=x'), /From 1 Nov 2026.*href="\/en\/news\?q=x"/);
    assert.equal(renderDateSummary({}), '');
  });
});
