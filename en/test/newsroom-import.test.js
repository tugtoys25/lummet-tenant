// test/newsroom-import.test.js -- import from WordPress WXR, RSS/Atom and CSV: parsing, safety, duplicates, drafts, mapping.
// Real migrated schema and real handlers. Not covered: a real WordPress export from a large site, image transfer (images stay as links).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as imp from '../worker/newsroom-import.js';
import * as ops from '../worker/newsroom-ops.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import { resetNewsFlagCache } from '../worker/database/newsroom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://news.example.com';
const ADMIN = { user_id: 1, role: 'admin' };

const WXR = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wp="http://wordpress.org/export/1.2/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"><channel>
<item><title>First &amp; Best</title><link>https://old.example.org/2020/05/first-post/</link><dc:creator><![CDATA[Elie]]></dc:creator><pubDate>Fri, 01 May 2020 10:00:00 +0000</pubDate>
<content:encoded><![CDATA[<p>Hello <b>world</b></p><script>alert(1)</script><img src="x.jpg" onerror="evil()"><a href="javascript:evil()">bad</a>]]></content:encoded><excerpt:encoded><![CDATA[Short summary]]></excerpt:encoded>
<wp:post_name><![CDATA[first-post]]></wp:post_name><wp:post_date_gmt>2020-05-01 10:00:00</wp:post_date_gmt><wp:status><![CDATA[publish]]></wp:status><wp:post_type><![CDATA[post]]></wp:post_type>
<category domain="category" nicename="news"><![CDATA[News]]></category><category domain="post_tag" nicename="a"><![CDATA[Alpha]]></category></item>
<item><title>About us</title><link>https://old.example.org/about/</link><content:encoded><![CDATA[<p>page</p>]]></content:encoded><wp:post_type><![CDATA[page]]></wp:post_type><wp:status>publish</wp:status></item>
<item><title>Second</title><link>https://old.example.org/?p=7</link><content:encoded><![CDATA[<p>Two</p>]]></content:encoded><wp:post_name>second-one</wp:post_name><wp:post_type>post</wp:post_type><wp:status>draft</wp:status></item>
<item><title>Empty one</title><content:encoded><![CDATA[]]></content:encoded><wp:post_name>empty-one</wp:post_name><wp:post_type>post</wp:post_type></item>
</channel></rss>`;
const RSS = `<rss version="2.0"><channel><item><title>Feed story</title><link>https://feed.example.com/news/feed-story-old</link><description>&lt;p&gt;Body from feed&lt;/p&gt;</description><pubDate>Mon, 02 Mar 2026 08:00:00 GMT</pubDate><category>Tech</category></item></channel></rss>`;
const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom story</title><link href="https://a.example.com/atom-story"/><id>tag:a,1</id><updated>2026-03-03T08:00:00Z</updated><content type="html">&lt;p&gt;Atom body&lt;/p&gt;</content><category term="Sport"/><author><name>Zed</name></author></entry></feed>`;
const CSV = 'title,slug,content,tags,author,published_at,url\r\n"Quoted, title","csv-one","<p>Line one\nline two</p>","a;b",Elie,2026-01-05,https://old.example.org/csv-one-old\r\n"=cmd()","csv-two","<p>x</p>",,,,\r\n';

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,role) VALUES (1,'elie','Elie','Editor')`).run();
  await db.prepare(`INSERT INTO news (id,slug,title,content,published,created_by) VALUES (50,'taken','Taken','<p>keep me</p>',1,1)`).run();
  const env = { DB: db, SITE_URL: BASE };
  resetNewsFlagCache(); ops.forgetOpsFlags(db);
  return env;
}
const flag = async (env, v = 'true') => { await env.DB.prepare(`INSERT INTO system_settings (key,value) VALUES ('news_import',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(v).run(); ops.forgetOpsFlags(env.DB); };
const api = async (env, method, route, body) => {
  const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (method === 'POST') init.body = JSON.stringify(body);
  const res = await handleNewsroomApi(new Request(`${BASE}/api/v1/newsroom/${route}`, init), env, ADMIN);
  return { status: res.status, ct: res.headers.get('Content-Type') || '', body: res.headers.get('Content-Type')?.includes('json') ? await res.json() : await res.text() };
};

describe('parsers', () => {
  test('WordPress: posts only, entities and CDATA decoded, slug, date, author, tags, status', () => {
    const items = imp.parseSource('wordpress', WXR);
    assert.deepEqual(items.map((i) => i.title), ['First & Best', 'Second', 'Empty one'], 'the page is left out');
    const a = items[0];
    assert.equal(a.slug, 'first-post'); assert.equal(a.published_at, '2020-05-01 10:00:00'); assert.equal(a.author, 'Elie');
    assert.equal(a.excerpt, 'Short summary'); assert.deepEqual(a.tags, ['News', 'Alpha']); assert.equal(items[1].status, 'draft');
  });
  test('RSS and Atom', () => {
    const r = imp.parseSource('rss', RSS)[0];
    assert.equal(r.title, 'Feed story'); assert.equal(r.content, '<p>Body from feed</p>'); assert.equal(r.published_at, '2026-03-02 08:00:00'); assert.deepEqual(r.tags, ['Tech']);
    const a = imp.parseSource('rss', ATOM)[0];
    assert.equal(a.link, 'https://a.example.com/atom-story'); assert.equal(a.content, '<p>Atom body</p>'); assert.deepEqual(a.tags, ['Sport']); assert.equal(a.author, 'Zed');
  });
  test('CSV: quotes, commas, newlines inside cells, odd line endings, BOM', () => {
    const items = imp.parseSource('csv', '﻿' + CSV);
    assert.equal(items.length, 2); assert.equal(items[0].title, 'Quoted, title'); assert.equal(items[0].content, '<p>Line one\nline two</p>');
    assert.deepEqual(items[0].tags, ['a', 'b']); assert.equal(items[0].published_at, '2026-01-05 00:00:00');
  });
  test('bad input is refused with a clear reason', () => {
    assert.throws(() => imp.parseSource('pdf', 'x'), /Unknown format/);
    assert.throws(() => imp.parseSource('rss', '   '), /empty/);
    assert.throws(() => imp.parseSource('rss', '<html></html>'), /No articles/);
    assert.throws(() => imp.parseSource('csv', 'title,content\r\n'), /No rows/);
    assert.throws(() => imp.parseSource('rss', 'x'.repeat(2 * 1024 * 1024 + 1)), /larger than 2 MB/);
  });
  test('slugs: accents, symbols, and address fallbacks', () => {
    assert.equal(imp.slugify('Café & Crème: 10 Tips!'), 'cafe-and-creme-10-tips');
    assert.equal(imp.slugify('日本語'), '');
    assert.equal(imp.slugify('a'.repeat(200)).length, 100);
  });
});

describe('switch and permissions', () => {
  test('ships off, is described in Flags, and refuses to run while off', async () => {
    const env = await mkEnv();
    assert.equal((await env.DB.prepare(`SELECT value FROM system_settings WHERE key='news_import'`).first()).value, 'false');
    assert.ok((await api(env, 'GET', 'flags')).body.flags.find((f) => f.key === 'news_import')?.help);
    assert.equal((await api(env, 'POST', 'import/preview', { format: 'rss', data: RSS })).status, 403);
    assert.equal((await api(env, 'POST', 'import/run', { format: 'rss', data: RSS })).status, 403);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news`).first()).c, 1, 'nothing created');
  });
});

describe('import', () => {
  test('preview changes nothing; run creates drafts only, sanitised, with author mapping and redirects', async () => {
    const env = await mkEnv(); await flag(env);
    const pv = await api(env, 'POST', 'import/preview', { format: 'wordpress', data: WXR });
    assert.equal(pv.status, 200); assert.equal(pv.body.found, 3); assert.equal(pv.body.will_create, 2); assert.equal(pv.body.will_skip, 1);
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) c FROM news`).first()).c, 1, 'preview wrote nothing');
    const run = await api(env, 'POST', 'import/run', { format: 'wordpress', data: WXR, filename: 'export.xml' });
    assert.equal(run.body.created, 2); assert.equal(run.body.skipped, 1);
    const rows = (await env.DB.prepare(`SELECT slug, title, content, published, published_at, author_id, tags, excerpt FROM news WHERE id != 50 ORDER BY id`).all()).results;
    assert.ok(rows.every((r) => r.published === 0), 'every imported article is a draft');
    const first = rows.find((r) => r.slug === 'first-post');
    assert.ok(first.content.includes('<b>world</b>') && !/script|onerror|javascript:/i.test(first.content), 'dangerous markup removed: ' + first.content);
    assert.equal(first.author_id, 1); assert.equal(first.tags, 'News, Alpha'); assert.equal(first.published_at, '2020-05-01 10:00:00'); assert.equal(first.excerpt, 'Short summary');
    assert.equal((await env.DB.prepare(`SELECT news_id FROM news_redirects WHERE old_slug='first-post'`).first()), null, 'same slug: no redirect needed');
  });
  test('existing addresses are never overwritten, repeats are skipped, an old-address redirect is added when different', async () => {
    const env = await mkEnv(); await flag(env);
    const csv = 'title,slug,content,url\r\nTaken again,taken,<p>new</p>,\r\nOne,one,<p>1</p>,https://old.example.org/one-old\r\nDup,one,<p>2</p>,\r\n';
    const r = await api(env, 'POST', 'import/run', { format: 'csv', data: csv });
    assert.equal(r.body.created, 1); assert.equal(r.body.skipped, 2);
    assert.equal((await env.DB.prepare(`SELECT content FROM news WHERE slug='taken'`).first()).content, '<p>keep me</p>');
    assert.ok(await env.DB.prepare(`SELECT 1 x FROM news_redirects WHERE old_slug='one-old'`).first());
    const again = await api(env, 'POST', 'import/run', { format: 'csv', data: csv });
    assert.equal(again.body.created, 0, 'running the same file twice adds nothing');
  });
  test('RSS, Atom and CSV all import; items beyond 300 are reported, not lost silently', async () => {
    const env = await mkEnv(); await flag(env);
    assert.equal((await api(env, 'POST', 'import/run', { format: 'rss', data: RSS })).body.created, 1);
    assert.equal((await api(env, 'POST', 'import/run', { format: 'rss', data: ATOM })).body.created, 1);
    assert.equal((await api(env, 'POST', 'import/run', { format: 'csv', data: CSV })).body.created, 2);
    const many = 'title,slug,content\r\n' + Array.from({ length: 305 }, (_, i) => `T${i},bulk-${i},<p>x</p>`).join('\r\n');
    const r = await api(env, 'POST', 'import/run', { format: 'csv', data: many });
    assert.equal(r.body.created, 300); assert.equal(r.body.over_limit, 5);
  });
  test('history and the mapping CSV (formula-safe), with an audit entry', async () => {
    const env = await mkEnv(); await flag(env);
    const run = await api(env, 'POST', 'import/run', { format: 'csv', data: CSV, filename: 'a.csv' });
    const list = (await api(env, 'GET', 'import/list')).body;
    assert.equal(list.imports[0].created_count, 2); assert.equal(list.imports[0].filename, 'a.csv');
    const csv = (await api(env, 'GET', `import/mapping.csv?id=${run.body.import_id}`)).body;
    assert.ok(csv.replace(/^\ufeff/, '').startsWith('old_url,new_url,title,result,note') && csv.includes(`${BASE}/en/news/csv-one`) && csv.includes('created as draft'));
    assert.ok(csv.includes("'=cmd()"), 'formula neutralised');
    assert.ok((await env.DB.prepare(`SELECT COUNT(*) c FROM audit_logs WHERE action='news_imported'`).first()).c === 1);
  });
});

describe('guards', () => {
  test('admin script avoids innerHTML', () => { assert.ok(!/innerHTML/.test(readFileSync(join(ROOT, 'js-src/newsroom-admin/13-import-tools.js'), 'utf-8'))); });
});
