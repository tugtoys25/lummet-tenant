// test/newsroom-search.test.js -- Stage K: news search (index, ranking, filters, pages, admin API).
// Real schema + real controllers (SQLite). Not covered: real D1 latency, browsers.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderNewsList } from '../worker/controllers.js';
import { handleNewsroomApi, searchReindexHook } from '../worker/newsroom-api.js';
import { setUserItemAccess } from '../worker/database/item-access.js';
import * as S from '../worker/newsroom-search.js';
import * as nr from '../worker/database/newsroom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
const ADMIN = { user_id: 1, role: 'admin' }, EDITOR = { user_id: 2, role: 'editor' };

async function mkEnv({ cache = false } = {}) {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin'),(2,'e@t.l','x','editor')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,published) VALUES (1,'jane-doe','Jane Doe',1),(2,'sam-roe','Sam Roe',1)`).run();
  await db.prepare(`INSERT INTO countries (code,name) VALUES ('GB','United Kingdom'),('DE','Germany')`).run();
  const env = { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
  if (cache) { const kv = new Map(); env.CACHE = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } }; env._kv = kv; }
  return env;
}
let seq = 300;
const art = async (env, o = {}) => {
  const id = o.id ?? ++seq;
  await env.DB.prepare(`INSERT INTO news (id,slug,title,content,excerpt,tags,published,published_at,created_at,author_id,created_by,section_id,article_type,primary_country) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?)`)
    .bind(id, o.slug ?? `a-${id}`, o.title ?? `Title ${id}`, o.content ?? '<p>Body text.</p>', o.excerpt ?? null, o.tags ?? null, o.published ?? 1, o.published_at ?? null, o.created_at ?? ago(o.age ?? 24), o.author ?? 1, o.section ?? null, o.type ?? null, o.country ?? null).run();
  if (o.index !== false) await S.reindexArticle(env.DB, id);
  return id;
};
const P = (o = {}) => ({ q: '', section: '', author: '', country: '', entity: '', type: '', from: '', to: '', status: '', workflow: '', page: 1, ...o });
const find = async (env, o, opts) => S.searchNews(env.DB, P(o), opts);
const titles = (r) => r.articles.map((a) => a.title);
const on = async (env, ...keys) => { await env.DB.prepare(`UPDATE system_settings SET value='true' WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).run(); nr.resetNewsFlagCache(); nr.resetCountryCache(); };
const page = async (env, qs) => { const r = await renderNewsList(new Request('https://site.test/en/news' + qs), env); return { status: r.status, html: await r.text() }; };

describe('tokenizing and term weights', () => {
  test('lower-cases, strips HTML/diacritics/punctuation, drops stop words and 1-letter tokens', () => {
    assert.deepEqual(S.tokenize('<p>The Café-Owners & UKGC\'s "Rules": 2026!</p>'), ['cafe', 'owners', 'ukgc', 'rules', '2026']);
    assert.deepEqual(S.tokenize('a b the and of'), []);
    assert.deepEqual(S.tokenize('US IT UK EU'), ['us', 'it', 'uk', 'eu'], 'domain-meaningful short words are kept');
    assert.deepEqual(S.tokenize('the and', { keepStop: true }), ['the', 'and']);
    assert.deepEqual(S.tokenize(null), []); assert.equal(S.tokenize('x'.repeat(60)).length, 0);
  });
  test('field weights: title beats entity/topic/tag beats section/excerpt beats body; the best weight wins (no summing)', () => {
    const t = S.buildTerms({ title: 'Alpha', tags: 'beta', excerpt: 'gamma', content: '<p>delta alpha alpha alpha</p>', section: 'Sigma', entities: ['Omega Corp'], topics: ['Licensing'] });
    assert.equal(t.get('alpha'), 10); assert.equal(t.get('beta'), 4); assert.equal(t.get('omega'), 4); assert.equal(t.get('licensing'), 4);
    assert.equal(t.get('gamma'), 3); assert.equal(t.get('sigma'), 3); assert.equal(t.get('delta'), 1);
  });
  test('body terms are capped at the 150 most frequent so the index stays small', () => {
    const words = Array.from({ length: 400 }, (_, i) => `word${String(i).padStart(3, '0')}`);
    const body = words.map((w, i) => (w + ' ').repeat(400 - i)).join(' ');
    const t = S.buildTerms({ content: body });
    assert.equal(t.size, 150); assert.ok(t.has('word000') && !t.has('word399'));
  });
  test('content hash is deterministic and sensitive to change', () => { assert.equal(S.fnv1a('abc'), S.fnv1a('abc')); assert.notEqual(S.fnv1a('abc'), S.fnv1a('abd')); });
});

describe('index maintenance', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });

  test('indexing writes terms + a doc row; unchanged content is skipped; edits replace the old terms', async () => {
    const id = await art(env, { title: 'Malta licence rules', content: '<p>gaming authority</p>' });
    assert.ok((await env.DB.prepare(`SELECT COUNT(*) c FROM news_search_terms WHERE news_id=?`).bind(id).first()).c >= 5);
    assert.deepEqual(await S.reindexArticle(env.DB, id), { ok: true, skipped: true });
    await env.DB.prepare(`UPDATE news SET title='Sweden reforms', content='<p>parliament vote</p>' WHERE id=?`).bind(id).run();
    assert.equal((await S.reindexArticle(env.DB, id)).skipped, undefined);
    const has = async (t) => (await env.DB.prepare(`SELECT COUNT(*) c FROM news_search_terms WHERE news_id=? AND term=?`).bind(id, t).first()).c;
    assert.equal(await has('malta'), 0); assert.equal(await has('sweden'), 1); assert.equal(await has('parliament'), 1);
    assert.equal((await S.reindexArticle(env.DB, id, { force: true })).skipped, undefined, 'force re-writes');
    assert.equal((await S.reindexArticle(env.DB, 999999)).ok, false);
  });

  test('a large article is written in bounded statements (D1 allows 100 bound parameters per statement)', async () => {
    const stmts = []; const spy = new Proxy(env.DB, { get: (t, k) => (k === 'prepare' ? (sql) => { const st = t.prepare(sql); const b = st.bind.bind(st); st.bind = (...p) => { if (/INSERT OR REPLACE INTO news_search_terms/.test(sql)) stmts.push(p.length); return b(...p); }; return st; } : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) });
    const id = await art(env, { index: false, content: '<p>' + Array.from({ length: 400 }, (_, i) => `token${i}`).join(' ') + '</p>' });
    await S.reindexArticle(spy, id);
    assert.ok(stmts.length >= 5 && stmts.every((n) => n <= 90), `binds per insert: ${stmts}`);
  });

  test('batch reindex walks the whole table with a cursor; a second pass skips everything; status reports completeness', async () => {
    for (let i = 0; i < 7; i++) await art(env, { index: false, title: `Article ${i}` });
    let cur = 0, guard = 0, total = 0, r;
    do { r = await S.reindexBatch(env.DB, { cursor: cur, limit: 3 }); cur = r.cursor; total += r.indexed; guard++; } while (r.remaining > 0 && guard < 10);
    assert.equal(total, 7); assert.equal(guard, 3);
    assert.equal((await S.indexStatus(env.DB)).complete, true);
    const again = await S.reindexBatch(env.DB, { cursor: 0, limit: 50 }); assert.deepEqual([again.indexed, again.skipped, again.failed], [0, 7, 0]);
  });

  test('failures never throw', async () => {
    const id = await art(env, { index: false });
    env.DB._raw.exec('ALTER TABLE news_search_terms RENAME TO nst_gone');
    const orig = console.error; console.error = () => {};
    try { assert.equal((await S.reindexArticle(env.DB, id)).ok, false); assert.equal((await S.reindexBySlug(env.DB, 'nope')).ok, false); await searchReindexHook(env, 'a-' + id); }
    finally { console.error = orig; }
  });
});

describe('search semantics', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });

  test('all words must match; the last word matches as a prefix; ranking = weight then recency', async () => {
    const t1 = await art(env, { title: 'Regulation update', content: '<p>gambling commission</p>', age: 10 });
    const t2 = await art(env, { title: 'Weekly digest', content: '<p>regulation news gambling</p>', age: 5 });
    const t3 = await art(env, { title: 'Regulation rewrite', content: '<p>gambling</p>', age: 2 });
    const t4 = await art(env, { title: 'Unrelated', content: '<p>casino payments</p>' });
    assert.deepEqual(titles(await find(env, { q: 'regulation' })), ['Regulation rewrite', 'Regulation update', 'Weekly digest'], 'title matches (10) outrank a body match (1); ties newest first');
    assert.deepEqual(titles(await find(env, { q: 'regulation gambling' })).sort(), ['Regulation rewrite', 'Regulation update', 'Weekly digest']);
    assert.deepEqual(titles(await find(env, { q: 'regulation commission' })), ['Regulation update'], 'AND semantics');
    assert.deepEqual(titles(await find(env, { q: 'regul' })).length, 3, 'prefix on the last word');
    assert.deepEqual(titles(await find(env, { q: 'gulation' })), [], 'not a substring search');
    assert.deepEqual(titles(await find(env, { q: 'commission regul' })), ['Regulation update'], 'prefix applies to the last word only');
    assert.deepEqual(titles(await find(env, { q: 'REGULATION!!' })).length, 3);
  });

  test('only LIVE articles are returned, even when a draft or scheduled article is indexed; unpublishing after indexing hides it at once', async () => {
    const live = await art(env, { title: 'Findable live' }), draft = await art(env, { title: 'Findable draft', published: 0 }), sched = await art(env, { title: 'Findable scheduled', published_at: '2099-01-01 00:00:00' });
    assert.deepEqual(titles(await find(env, { q: 'findable' })), ['Findable live']);
    await env.DB.prepare(`UPDATE news SET published=0 WHERE id=?`).bind(live).run();
    assert.deepEqual(titles(await find(env, { q: 'findable' })), []);
  });

  test('filters: section (with children), author, country (canonical slug, primary or additional), entity, type (news = NULL), date range, and combinations', async () => {
    const reg = (await env.DB.prepare(`SELECT id FROM news_sections WHERE slug='regulation'`).first()).id;
    const child = (await env.DB.prepare(`INSERT INTO news_sections (slug,name,parent_id) VALUES ('reg-child','Child',?)`).bind(reg).run()).meta.last_row_id;
    const e = (await env.DB.prepare(`INSERT INTO news_entities (slug,name) VALUES ('ukgc','UKGC')`).run()).meta.last_row_id;
    const a = await art(env, { title: 'Alpha story', section: reg, author: 1, country: 'GB', type: 'analysis', age: 24 * 3 });
    const b = await art(env, { title: 'Beta story', section: child, author: 2, age: 24 * 10 });
    const c = await art(env, { title: 'Gamma story', author: 1, age: 24 * 20 });
    await env.DB.prepare(`INSERT INTO news_article_countries (news_id,country_code) VALUES (?, 'DE')`).bind(c).run();
    await env.DB.prepare(`INSERT INTO news_article_entities (news_id,entity_id) VALUES (?,?)`).bind(b, e).run();
    const T = async (o) => titles(await find(env, o)).sort();
    assert.deepEqual(await T({ section: 'regulation' }), ['Alpha story', 'Beta story']);
    assert.deepEqual(await T({ author: 'sam-roe' }), ['Beta story']);
    assert.deepEqual(await T({ country: 'united-kingdom' }), ['Alpha story']); assert.deepEqual(await T({ country: 'germany' }), ['Gamma story']);
    assert.deepEqual(await T({ entity: 'ukgc' }), ['Beta story']);
    assert.deepEqual(await T({ type: 'analysis' }), ['Alpha story']); assert.deepEqual(await T({ type: 'news' }), ['Beta story', 'Gamma story']);
    const d = (h) => new Date(Date.now() - h * 3600e3).toISOString().slice(0, 10);
    assert.deepEqual(await T({ from: d(24 * 12), to: d(24 * 2) }), ['Alpha story', 'Beta story']);
    assert.deepEqual(await T({ q: 'story', author: 'jane-doe', from: d(24 * 5) }), ['Alpha story']);
    assert.deepEqual(await T({ q: 'story' }), ['Alpha story', 'Beta story', 'Gamma story']);
  });

  test('unknown or malformed filter values give an empty result and say which filter was invalid (never an error or "everything")', async () => {
    await art(env, { title: 'Something' });
    for (const [k, v] of [['section', 'nope'], ['author', 'nobody'], ['country', 'atlantis'], ['entity', 'zzz'], ['type', 'gossip'], ['from', '2026-13-45'], ['to', 'yesterday']]) {
      const r = await find(env, { [k]: v }); assert.deepEqual([r.ok, r.total, r.invalid_filters], [true, 0, [k]], k);
    }
  });

  test('stop-word-only and symbol-only queries match nothing; long queries are cut to 8 words; hostile text is inert', async () => {
    await art(env, { title: 'Normal article', content: '<p>percent sign 100% sure</p>' });
    for (const q of ['the and of', '!!! ??? ---']) assert.deepEqual([(await find(env, { q })).total, (await find(env, { q })).articles.length], [0, 0], q);
    assert.equal((await find(env, { q: 'a1 b2 c3 d4 e5 f6 g7 h8 i9 j10 k11' })).tokens.length, 8);
    for (const q of ["' OR 1=1 --", '"; DROP TABLE news; --', '%', '_', '%%%normal', "normal' AND '1'='1"]) { const r = await find(env, { q }); assert.equal(r.ok, true, q); }
    assert.equal((await find(env, { q: '%' })).total, 0, '% is not a wildcard');
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news`).first()).c, 1);
  });

  test('pagination: totals, page size and invalid page numbers', async () => {
    for (let i = 0; i < 30; i++) await art(env, { title: `Story number ${i}`, age: i + 1 });
    const p1 = await find(env, { q: 'story' }), p3 = await find(env, { q: 'story', page: 3 });
    assert.equal(p1.total, 30); assert.equal(p1.articles.length, 12); assert.equal(p3.articles.length, 6);
    for (const bad of [0, -1, 501, 1.5, NaN]) assert.equal((await find(env, { q: 'story', page: bad })).ok, false, String(bad));
  });

  test('term lookups use the primary key (index seeks), never a table scan', async () => {
    const plan = (await env.DB.prepare(`EXPLAIN QUERY PLAN SELECT n.id FROM news n WHERE n.id IN (SELECT news_id FROM news_search_terms WHERE term = ?) AND n.id IN (SELECT news_id FROM news_search_terms WHERE term >= ? AND term < ?)`).bind('a', 'b', 'c').all()).results.map((r) => r.detail).join(' | ');
    assert.match(plan, /SEARCH news_search_terms USING (COVERING )?INDEX sqlite_autoindex_news_search_terms_1|SEARCH news_search_terms USING PRIMARY KEY/);
    assert.ok(!/SCAN news_search_terms/.test(plan), plan);
  });
});

describe('admin mode', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });
  test('sees drafts and scheduled articles, status/workflow filters, item-access scope; workflow state never appears in public results', async () => {
    const live = await art(env, { title: 'Alpha live', author: 1 }), draft = await art(env, { title: 'Alpha draft', published: 0 }), sched = await art(env, { title: 'Alpha sched', published_at: '2099-01-01 00:00:00' });
    await env.DB.prepare(`INSERT INTO news_editorial (news_id, workflow_status) VALUES (?, 'editorial_review')`).bind(draft).run();
    const adm = (o) => S.searchNews(env.DB, P(o), { mode: 'admin', user: ADMIN, pageSize: 25 });
    assert.equal((await adm({ q: 'alpha' })).total, 3);
    assert.deepEqual((await adm({ q: 'alpha', status: 'draft' })).articles.map((a) => a.title), ['Alpha draft']);
    assert.deepEqual((await adm({ q: 'alpha', status: 'scheduled' })).articles.map((a) => a.title), ['Alpha sched']);
    assert.deepEqual((await adm({ q: 'alpha', status: 'published' })).articles.map((a) => a.title), ['Alpha live']);
    assert.deepEqual((await adm({ workflow: 'editorial_review' })).articles.map((a) => [a.title, a.workflow_status]), [['Alpha draft', 'editorial_review']]);
    const pub = await find(env, { q: 'alpha' });
    assert.ok(pub.articles.every((a) => !('workflow_status' in a)), 'internal workflow state is not selected in public mode');
    await env.DB.prepare(`UPDATE news SET created_by = 2 WHERE id = ?`).bind(live).run(); await setUserItemAccess(env.DB, 2, 'news', 'read', 'own');
    assert.deepEqual((await S.searchNews(env.DB, P({ q: 'alpha' }), { mode: 'admin', user: EDITOR })).articles.map((a) => a.title), ['Alpha live']);
  });
});

describe('public search page (flag news_search_v2)', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });

  test('flag OFF: the existing search is used untouched', async () => {
    await art(env, { title: 'Legacy hit' });
    const { html } = await page(env, '?q=legacy');
    assert.ok(html.includes('class="news-grid"') && !html.includes('nr-search') && html.includes('Legacy hit'));
  });

  test('flag ON but the index has never been built: falls back to the existing search instead of showing "no results"', async () => {
    await art(env, { title: 'Legacy hit', index: false }); await on(env, 'news_search_v2');
    const { html } = await page(env, '?q=legacy');
    assert.ok(html.includes('class="news-grid"') && html.includes('Legacy hit') && !html.includes('nr-search'));
  });

  test('flag ON: results, count, form state, canonical, noindex, JSON-LD and pagination that keeps the filters', async () => {
    await on(env, 'news_search_v2');
    for (let i = 0; i < 14; i++) await art(env, { title: `Casino report ${i}`, author: 1, age: i + 1 });
    await art(env, { title: 'Casino by Sam', author: 2 });
    const { status, html } = await page(env, '?q=casino&author=jane-doe&utm=x');
    assert.equal(status, 200);
    assert.match(html, /<p class="nr-search__count" role="status">14 results<\/p>/);
    assert.ok(!html.includes('Casino by Sam'));
    assert.match(html, /<input id="nr-q" type="search" name="q" value="casino"/);
    assert.match(html, /<option value="jane-doe" selected>Jane Doe<\/option>/);
    assert.match(html, /<link rel="canonical" href="https:\/\/site\.test\/en\/news">/);
    assert.match(html, /name="robots" content="noindex, follow"/);
    assert.match(html, /<a rel="next" href="\/en\/news\?q=casino&amp;author=jane-doe&amp;page=2">Next<\/a>/);
    assert.ok(!html.includes('utm='), 'unrelated query parameters are not carried into links');
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    assert.equal(ld.find((j) => j['@type'] === 'SearchResultsPage').mainEntity.itemListElement.length, 12);
    const p2 = await page(env, '?q=casino&author=jane-doe&page=2');
    assert.equal(p2.status, 200); assert.match(p2.html, /rel="prev" href="\/en\/news\?q=casino&amp;author=jane-doe"/);
    for (const bad of ['3', '0', 'abc']) assert.equal((await page(env, `?q=casino&author=jane-doe&page=${bad}`)).status, 404, bad);
  });

  test('no results: friendly message, still 200 and noindex; filters-only search works without the index', async () => {
    await on(env, 'news_search_v2'); await art(env, { title: 'Present', section: (await env.DB.prepare(`SELECT id FROM news_sections WHERE slug='markets'`).first()).id });
    const none = await page(env, '?q=zzzzqq'); assert.equal(none.status, 200); assert.match(none.html, /No articles match your search\./); assert.match(none.html, /noindex/);
    env.DB._raw.exec('DELETE FROM news_search_docs');
    const f = await page(env, '?section=markets'); assert.equal(f.status, 200); assert.ok(f.html.includes('Present'));
    assert.match((await page(env, '?section=unknown')).html, /No articles match your search\./);
  });

  test('the reflected query cannot inject markup anywhere (title, form, heading, JSON-LD)', async () => {
    await on(env, 'news_search_v2'); await art(env, { title: 'Something' });
    const payload = '</title><script>alert(1)</script>"><img src=x onerror=alert(2)>';
    const { status, html } = await page(env, '?q=' + encodeURIComponent(payload));
    assert.equal(status, 200);
    for (const bad of ['<script>alert(1)', '<img src=x onerror', '</title><script>']) assert.ok(!html.includes(bad), bad);
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].forEach((m) => JSON.parse(m[1]));
    const p2 = await page(env, '?type=' + encodeURIComponent('"><svg onload=alert(3)>')); assert.ok(!p2.html.includes('<svg onload'));
  });

  test('form facets: only sections/authors/types/countries that have live articles; entities only with entity pages on; cached', async () => {
    const e2 = await mkEnv({ cache: true });
    const reg = (await e2.DB.prepare(`SELECT id FROM news_sections WHERE slug='regulation'`).first()).id;
    await art(e2, { title: 'A', section: reg, author: 1, country: 'GB', type: 'analysis' }); await art(e2, { title: 'Hidden', author: 2, published: 0 });
    const ent = (await e2.DB.prepare(`INSERT INTO news_entities (slug,name) VALUES ('ukgc','UKGC')`).run()).meta.last_row_id; await e2.DB.prepare(`INSERT INTO news_article_entities (news_id,entity_id) VALUES (301+0,?) `).bind(ent).run().catch(() => {});
    let f = await S.getSearchFacets(e2.DB, e2, { entityPages: false });
    assert.deepEqual(f.sections.map((s) => s.slug), ['regulation']); assert.deepEqual(f.authors.map((a) => a.slug), ['jane-doe']);
    assert.deepEqual(f.types, ['analysis']); assert.deepEqual(f.countries, [{ slug: 'united-kingdom', name: 'United Kingdom' }]); assert.deepEqual(f.entities, []);
    assert.ok(e2._kv.has('news:search:facets:0'));
    await e2.DB.prepare(`DELETE FROM news`).run(); assert.deepEqual((await S.getSearchFacets(e2.DB, e2, { entityPages: false })).sections.length, 1, 'served from cache');
  });
});

describe('admin API', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });
  const call = async (method, route, user, body) => { const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (body) init.body = JSON.stringify(body); const r = await handleNewsroomApi(new Request(`https://site.test/api/v1/newsroom/${route}`, init), env, user); return { status: r.status, json: await r.json() }; };

  test('search: needs news.read, includes drafts, validates the page, and reindex/status need manage_settings', async () => {
    await art(env, { title: 'Alpha draft', published: 0 });
    assert.equal((await call('GET', 'search?q=alpha', { user_id: 9, role: 'nobody' })).status, 403);
    const r = await call('GET', 'search?q=alpha&status=draft', EDITOR); assert.equal(r.status, 200); assert.deepEqual(r.json.articles.map((a) => a.title), ['Alpha draft']);
    assert.equal((await call('GET', 'search?q=alpha&page=0', ADMIN)).status, 404);
    assert.equal((await call('GET', 'search/status', EDITOR)).status, 403); assert.equal((await call('POST', 'search/reindex', EDITOR, {})).status, 403);
    for (let i = 0; i < 4; i++) await art(env, { index: false, title: `Bulk ${i}` });
    let st = (await call('GET', 'search/status', ADMIN)).json; assert.equal(st.complete, false); assert.equal(st.enabled, false);
    let cur = 0, done = false, n = 0; while (!done && n++ < 10) { const x = (await call('POST', 'search/reindex', ADMIN, { cursor: cur, limit: 2 })).json; cur = x.cursor; done = x.remaining === 0; }
    assert.equal((await call('GET', 'search/status', ADMIN)).json.complete, true);
  });

  test('saves keep the index current: a new title is searchable and the old one is not; classification saves add section names', async () => {
    const id = await art(env, { slug: 'x', title: 'Old headline' });
    await env.DB.prepare(`UPDATE news SET title='Fresh headline' WHERE id=?`).bind(id).run(); await searchReindexHook(env, 'x');
    assert.equal((await find(env, { q: 'fresh' })).total, 1); assert.equal((await find(env, { q: 'old' })).total, 0);
    const sec = (await env.DB.prepare(`SELECT id FROM news_sections WHERE slug='payments'`).first()).id;
    assert.equal((await find(env, { q: 'payments' })).total, 0);
    assert.equal((await call('POST', 'article/meta/save', ADMIN, { id, meta: { section_id: sec } })).status, 200);
    assert.equal((await find(env, { q: 'payments' })).total, 1);
  });
});
