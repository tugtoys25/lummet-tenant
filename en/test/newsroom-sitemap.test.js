// test/newsroom-sitemap.test.js -- Phase 27/28: news sitemap correctness.
// Real sitemapEngine + real robots() controller against the migrated schema.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { sitemapEngine, xmlEscape, toIsoUtc } from '../worker/sitemap.js';
import { robots } from '../worker/controllers.js';

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name) VALUES (1,'elie','Elie')`).run();
  return { DB: db };
}
const REQ = () => new Request('https://site.test/en/sitemap-news.xml');
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
const add = (env, o) => env.DB.prepare(`INSERT INTO news (id,slug,title,content,published,published_at,created_at,updated_at,author_id,created_by,content_class,article_type) VALUES (?,?,?,?,?,?,?,?,1,1,?,?)`)
  .bind(o.id, o.slug, o.title ?? 'T ' + o.slug, '<p>x</p>', o.published ?? 1, o.published_at ?? null, o.created_at ?? ago(500), o.updated_at ?? o.created_at ?? ago(400), o.cls ?? null, o.type ?? null).run();
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const newsSitemap = async (env) => (await sitemapEngine.generate(REQ(), env, env.DB, 'news')).text();
const gnews = async (env) => sitemapEngine.generateGoogleNews(new Request('https://site.test/en/news-sitemap.xml'), env, env.DB);
const flagOn = (env) => env.DB.prepare(`UPDATE system_settings SET value='true' WHERE key='news_google_sitemap'`).run();

describe('helpers', () => {
  test('xmlEscape covers the five XML entities', () => assert.equal(xmlEscape(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&apos;&amp;'));
  test('toIsoUtc accepts SQLite and ISO forms as UTC, rejects junk', () => {
    assert.equal(toIsoUtc('2026-09-19 10:00:00'), '2026-09-19T10:00:00.000Z');
    assert.equal(toIsoUtc('2026-08-30T08:11'), '2026-08-30T08:11:00.000Z');
    assert.equal(toIsoUtc('2026-09-19T10:00:00+02:00'), '2026-09-19T08:00:00.000Z');
    assert.equal(toIsoUtc('nonsense'), null); assert.equal(toIsoUtc(null), null);
  });
});

describe('existing news sitemap (/en/sitemap-news.xml): corrected, not replaced', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });

  test('lists live articles (past or NULL published_at); excludes drafts and scheduled ones', async () => {
    await add(env, { id: 1, slug: 'live-null' });
    await add(env, { id: 2, slug: 'live-past', published_at: ago(10) });
    await add(env, { id: 3, slug: 'live-iso-t', published_at: '2026-08-30T08:11' });
    await add(env, { id: 4, slug: 'draft', published: 0 });
    await add(env, { id: 5, slug: 'scheduled', published_at: '2099-01-01 00:00:00' });
    const xml = await newsSitemap(env);
    assert.deepEqual(locs(xml).sort(), ['https://site.test/en/news/live-iso-t', 'https://site.test/en/news/live-null', 'https://site.test/en/news/live-past']);
  });

  test('URL shape is unchanged (/en/news/<slug>); lastmod is a valid date; newest first', async () => {
    await add(env, { id: 1, slug: 'old', created_at: ago(900), updated_at: '2026-01-02 03:04:05' });
    await add(env, { id: 2, slug: 'new', published_at: ago(1) });
    const xml = await newsSitemap(env);
    assert.deepEqual(locs(xml), ['https://site.test/en/news/new', 'https://site.test/en/news/old']);
    assert.match(xml, /<loc>https:\/\/site\.test\/en\/news\/old<\/loc>\s*<lastmod>2026-01-02<\/lastmod>/);
    for (const m of xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/);
  });

  test('a slug containing XML metacharacters cannot break the document', async () => {
    await add(env, { id: 1, slug: 'a&b<c>' });
    const xml = await newsSitemap(env);
    assert.ok(xml.includes('/en/news/a&amp;b%3Cc%3E</loc>'), 'ampersand escaped, angle brackets percent-encoded by URL normalisation');
    assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml), 'no bare ampersands');
  });

  test('the combined /sitemap.xml applies the same live filter', async () => {
    await add(env, { id: 1, slug: 'live' }); await add(env, { id: 2, slug: 'sched', published_at: '2099-01-01 00:00:00' });
    const xml = await (await sitemapEngine.generate(REQ(), env, env.DB, 'all')).text();
    assert.ok(xml.includes('/en/news/live</loc>') && !xml.includes('/en/news/sched'));
  });

  test('every URL in the sitemap is one renderNews would serve (live), never a 404', async () => {
    const { renderNews } = await import('../worker/controllers.js');
    const { readFileSync, existsSync } = await import('node:fs'); const { join, dirname } = await import('node:path'); const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    env.ASSETS = { fetch: async (r) => { const f = join(root, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } };
    await add(env, { id: 1, slug: 'live' }); await add(env, { id: 2, slug: 'sched', published_at: '2099-01-01 00:00:00' }); await add(env, { id: 3, slug: 'draft', published: 0 });
    for (const loc of locs(await newsSitemap(env))) {
      const slug = loc.split('/').pop();
      assert.equal((await renderNews(new Request(loc), env, slug, null)).status, 200, loc);
    }
  });
});

describe('Google News sitemap (/en/news-sitemap.xml), flag news_google_sitemap', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });

  test('404 while the flag is off; not advertised in the index or robots.txt', async () => {
    assert.equal((await gnews(env)).status, 404);
    const idx = await (await sitemapEngine.generateIndex(REQ(), env, env.DB)).text();
    assert.ok(!idx.includes('news-sitemap.xml'));
    const rb = await (await robots(new Request('https://site.test/robots.txt'), env)).text();
    assert.ok(!rb.includes('news-sitemap.xml'));
    assert.ok(rb.includes('sitemap-news.xml'), 'existing entries untouched');
  });

  test('flag on: advertised, valid namespace, publication name from site settings (not hardcoded)', async () => {
    await flagOn(env);
    await add(env, { id: 1, slug: 'fresh', published_at: ago(3), title: 'Fresh & <Hot> "News"' });
    const res = await gnews(env); const xml = await res.text();
    assert.equal(res.status, 200);
    assert.match(xml, /xmlns:news="http:\/\/www\.google\.com\/schemas\/sitemap-news\/0\.9"/);
    assert.match(xml, /<news:title>Fresh &amp; &lt;Hot&gt; &quot;News&quot;<\/news:title>/);
    assert.match(xml, /<news:language>en<\/news:language>/);
    assert.match(xml, /<news:publication_date>\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z<\/news:publication_date>/);
    const name = xml.match(/<news:name>([^<]*)<\/news:name>/)[1];
    assert.ok(name.length > 0);
    const idx = await (await sitemapEngine.generateIndex(REQ(), env, env.DB)).text();
    assert.ok(idx.includes('https://site.test/en/news-sitemap.xml'));
    assert.ok((await (await robots(new Request('https://site.test/robots.txt'), env)).text()).includes('Sitemap: https://site.test/en/news-sitemap.xml'));
  });

  test('only the last 48h; excludes drafts, scheduled, sponsored, commercial and press releases', async () => {
    await flagOn(env);
    await add(env, { id: 1, slug: 'fresh', published_at: ago(2) });
    await add(env, { id: 2, slug: 'fresh-null-pub', created_at: ago(5) });
    await add(env, { id: 3, slug: 'old', published_at: ago(60) });
    await add(env, { id: 4, slug: 'draft', published: 0, published_at: ago(1) });
    await add(env, { id: 5, slug: 'scheduled', published_at: '2099-01-01 00:00:00' });
    await add(env, { id: 6, slug: 'sponsored', published_at: ago(1), cls: 'sponsored' });
    await add(env, { id: 7, slug: 'commercial', published_at: ago(1), cls: 'commercial' });
    await add(env, { id: 8, slug: 'pr-class', published_at: ago(1), cls: 'press_release' });
    await add(env, { id: 9, slug: 'pr-type', published_at: ago(1), type: 'press_release' });
    await add(env, { id: 10, slug: 'analysis', published_at: ago(1), type: 'analysis' });
    const l = locs(await (await gnews(env)).text()).map((u) => u.split('/').pop()).sort();
    assert.deepEqual(l, ['analysis', 'fresh', 'fresh-null-pub']);
  });

  test('caps at 1000 URLs and an empty result is still a valid urlset', async () => {
    await flagOn(env);
    assert.match(await (await gnews(env)).text(), /<urlset [^>]*>\s*<\/urlset>$/);
    for (let i = 0; i < 1005; i++) await add(env, { id: 100 + i, slug: `n-${i}`, published_at: ago(1) });
    assert.equal(locs(await (await gnews(env)).text()).length, 1000);
  });

  test('if the query fails it degrades to an empty valid sitemap, not a 500', async () => {
    await flagOn(env);
    env.DB._raw.exec('ALTER TABLE news RENAME TO news_gone');
    const origErr = console.error; console.error = () => {};
    try { const r = await gnews(env); assert.equal(r.status, 200); assert.match(await r.text(), /<urlset [^>]*>\s*<\/urlset>$/); }
    finally { console.error = origErr; }
  });
});

describe('landing-page sitemap (/en/sitemap-news-sections.xml, flag news_new_taxonomy)', () => {
  let env; beforeEach(async () => { env = await mkEnv(); await env.DB.prepare(`INSERT INTO countries (code,name) VALUES ('GB','UK'),('DE','Germany')`).run(); });
  const on = async (...keys) => { await env.DB.prepare(`UPDATE system_settings SET value='true' WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).run(); (await import('../worker/database/newsroom.js')).resetNewsFlagCache(); };
  const landing = async () => (await sitemapEngine.generate(REQ(), env, env.DB, 'news-landing')).text();
  const paths = (xml) => locs(xml).map((u) => u.replace('https://site.test', '')).sort();
  const addNews = (id, o = {}) => env.DB.prepare(`INSERT INTO news (id,slug,title,content,published,published_at,created_at,updated_at,author_id,created_by,section_id,primary_country,region_slug) VALUES (?,?,?,?,?,?,?,?,1,1,?,?,?)`)
    .bind(id, o.slug ?? `n-${id}`, `T ${id}`, '<p>x</p>', o.published ?? 1, o.published_at ?? null, o.created_at ?? ago(24), ago(24), o.section ?? null, o.country ?? null, o.region ?? null).run();

  test('flag off: an empty valid urlset, and it is not advertised', async () => {
    await addNews(1, { section: 1 });
    assert.match(await landing(), /<urlset [^>]*>\s*<\/urlset>$/);
    assert.ok(!(await (await sitemapEngine.generateIndex(REQ(), env, env.DB)).text()).includes('sitemap-news-sections'));
    assert.ok(!(await (await robots(new Request('https://site.test/robots.txt'), env)).text()).includes('sitemap-news-sections'));
  });

  test('flag on: only landing pages that list at least one LIVE article, with the newest article date as lastmod; advertised in index, robots and the combined sitemap', async () => {
    await on('news_new_taxonomy', 'news_entity_pages');
    const sec = (slug) => env.DB.prepare(`SELECT id FROM news_sections WHERE slug=?`).bind(slug).first().then((r) => r.id);
    const reg = await sec('regulation'), mkts = await sec('markets'), tech = await sec('technology');
    const child = (await env.DB.prepare(`INSERT INTO news_sections (slug,name,parent_id) VALUES ('reg-child','Child',?)`).bind(reg).run()).meta.last_row_id;
    await addNews(1, { section: child, created_at: '2026-03-10 10:00:00', country: 'GB', region: 'europe' });     // parent 'regulation' gets it through its child
    await addNews(2, { section: mkts, created_at: '2026-04-01 10:00:00', published: 0 });                         // draft only => markets excluded
    await addNews(3, { section: tech, published_at: '2099-01-01 00:00:00' });                                     // scheduled only => technology excluded
    const t = (await env.DB.prepare(`INSERT INTO news_topics (slug,name) VALUES ('licensing','L'),('unused','U')`).run()); await env.DB.prepare(`INSERT INTO news_article_topics (news_id,topic_id) VALUES (1, (SELECT id FROM news_topics WHERE slug='licensing'))`).run();
    await env.DB.prepare(`INSERT INTO news_series (slug,name) VALUES ('s1','S')`).run(); await env.DB.prepare(`INSERT INTO news_series_articles (series_id,news_id,position) VALUES ((SELECT id FROM news_series WHERE slug='s1'),1,1)`).run();
    await env.DB.prepare(`INSERT INTO news_entities (slug,name) VALUES ('ukgc','U'),('empty','E')`).run(); await env.DB.prepare(`INSERT INTO news_article_entities (news_id,entity_id) VALUES (1,(SELECT id FROM news_entities WHERE slug='ukgc'))`).run();
    // topic / series / entity that are linked ONLY to a draft article must not be listed
    await env.DB.prepare(`INSERT INTO news_topics (slug,name) VALUES ('draft-topic','D')`).run(); await env.DB.prepare(`INSERT INTO news_article_topics (news_id,topic_id) VALUES (2,(SELECT id FROM news_topics WHERE slug='draft-topic'))`).run();
    await env.DB.prepare(`INSERT INTO news_series (slug,name) VALUES ('draft-series','D')`).run(); await env.DB.prepare(`INSERT INTO news_series_articles (series_id,news_id,position) VALUES ((SELECT id FROM news_series WHERE slug='draft-series'),2,1)`).run();
    await env.DB.prepare(`INSERT INTO news_entities (slug,name) VALUES ('draft-ent','D')`).run(); await env.DB.prepare(`INSERT INTO news_article_entities (news_id,entity_id) VALUES (2,(SELECT id FROM news_entities WHERE slug='draft-ent'))`).run();
    await env.DB.prepare(`INSERT INTO news_article_countries (news_id,country_code) VALUES (1,'DE')`).run();
    await env.DB.prepare(`UPDATE countries SET published=0 WHERE code='DE'`).run();
    const xml = await landing();
    assert.deepEqual(paths(xml), ['/en/news/europe', '/en/news/entity/ukgc', '/en/news/regulation', '/en/news/reg-child', '/en/news/series/s1', '/en/news/topic/licensing', '/en/news/united-kingdom'].sort());
    for (const m of xml.matchAll(/<loc>[^<]*\/en\/news\/(?:europe|regulation|reg-child)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) assert.equal(m[1], '2026-03-10');
    assert.ok((await (await sitemapEngine.generateIndex(REQ(), env, env.DB)).text()).includes('https://site.test/en/sitemap-news-sections.xml'));
    assert.ok((await (await robots(new Request('https://site.test/robots.txt'), env)).text()).includes('Sitemap: https://site.test/en/sitemap-news-sections.xml'));
    assert.ok((await (await sitemapEngine.generate(REQ(), env, env.DB, 'all')).text()).includes('/en/news/topic/licensing'));
  });

  test('entities are listed only when entity pages are enabled', async () => {
    await on('news_new_taxonomy');
    await addNews(1); await env.DB.prepare(`INSERT INTO news_entities (slug,name) VALUES ('ukgc','U')`).run(); await env.DB.prepare(`INSERT INTO news_article_entities (news_id,entity_id) VALUES (1,(SELECT id FROM news_entities WHERE slug='ukgc'))`).run();
    assert.ok(!(await landing()).includes('/entity/'));
  });

  test('every URL in the landing sitemap is served (200) by the real controllers; nothing 404s or is noindex-empty', async () => {
    const { renderNews, renderNewsTaxonomyPage } = await import('../worker/controllers.js');
    const { readFileSync, existsSync } = await import('node:fs'); const { join, dirname } = await import('node:path'); const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    env.ASSETS = { fetch: async (r) => { const f = join(root, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } };
    await on('news_new_taxonomy', 'news_entity_pages');
    const reg = (await env.DB.prepare(`SELECT id FROM news_sections WHERE slug='regulation'`).first()).id;
    await addNews(1, { section: reg, country: 'GB', region: 'europe' });
    await env.DB.prepare(`INSERT INTO news_topics (slug,name) VALUES ('licensing','L')`).run(); await env.DB.prepare(`INSERT INTO news_article_topics (news_id,topic_id) VALUES (1,1)`).run();
    await env.DB.prepare(`INSERT INTO news_series (slug,name) VALUES ('s1','S')`).run(); await env.DB.prepare(`INSERT INTO news_series_articles (series_id,news_id,position) VALUES (1,1,1)`).run();
    await env.DB.prepare(`INSERT INTO news_entities (slug,name) VALUES ('ukgc','U')`).run(); await env.DB.prepare(`INSERT INTO news_article_entities (news_id,entity_id) VALUES (1,1)`).run();
    const list = paths(await landing()); assert.equal(list.length, 6);
    for (const p of list) {
      const m = p.match(/^\/en\/news\/(topic|entity|series)\/(.+)$/);
      const res = m ? await renderNewsTaxonomyPage(new Request('https://site.test' + p), env, m[1], m[2]) : await renderNews(new Request('https://site.test' + p), env, p.split('/').pop(), null);
      assert.equal(res.status, 200, p); assert.ok(!/name="robots" content="noindex/.test(await res.text()), `${p} is noindex`);
    }
  });

  test('a failing query degrades to fewer URLs, not an error', async () => {
    await on('news_new_taxonomy'); await addNews(1, { section: (await env.DB.prepare(`SELECT id FROM news_sections WHERE slug='regulation'`).first()).id });
    env.DB._raw.exec('ALTER TABLE news_series RENAME TO ns_gone');
    const orig = console.error; console.error = () => {};
    try { const r = await sitemapEngine.generate(REQ(), env, env.DB, 'news-landing'); assert.equal(r.status, 200); assert.ok((await r.text()).includes('/en/news/regulation')); } finally { console.error = orig; }
  });
});
