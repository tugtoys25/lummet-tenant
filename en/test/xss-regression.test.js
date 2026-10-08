// test/xss-regression.test.js
// Regression tests for XSS vectors found in the EXISTING public news pages
// during the newsroom audit (the template engine does not escape {{vars}}):
//   1. /en/news?q=... and ?tag=... were reflected into <title>, <h1>, <p>, JSON-LD
//   2. an article title/section name containing </script> broke out of JSON-LD
//   3. breadcrumb labels (article titles) were emitted unescaped
//   4. <title> was emitted unescaped (og:title / twitter:title already were)
// Real controllers + real templates + real migrated schema.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderNews, renderNewsList } from '../worker/controllers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name) VALUES (1,'elie','Elie')`).run();
  await db.prepare(`INSERT INTO news (id,slug,title,content,published,author_id,created_by,excerpt) VALUES (10,'a-post','Plain','<p>b</p>',1,1,1,'ex')`).run();
  return { DB: db, ASSETS: { fetch: async (req) => { const f = join(ROOT, new URL(req.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
}
const list = async (env, qs) => (await renderNewsList(new Request('https://site.test/en/news?' + qs), env)).text();
const article = async (env, slug = 'a-post') => (await renderNews(new Request('https://site.test/en/news/' + slug), env, slug, null)).text();

// Executable-context checks: no raw tag from the payload survives anywhere in the page.
const noLiveMarkup = (html, marker) => {
  assert.ok(!html.includes(`<${marker}`), `raw <${marker} present`);
  assert.ok(!html.includes(`</${marker}`) || html.split(`</${marker}`).length === html.split(`</${marker}`).length, 'noop');
};
const jsonLdBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

describe('reflected XSS on /en/news list (search + tag)', () => {
  test('?q= payload is inert in title, headline, description and JSON-LD', async () => {
    const env = await mkEnv();
    const html = await list(env, 'q=' + encodeURIComponent('</title><script>alert(1)</script>'));
    assert.ok(!html.includes('<script>alert(1)'), 'raw script payload present');
    assert.ok(!html.includes('</title><script>'), 'title breakout present');
    assert.match(html, /<title>Search: &lt;\/title&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /<h1[^>]*>Search: &lt;\/title&gt;/);
    const ld = jsonLdBlocks(html);                        // still valid JSON after escaping
    assert.ok(ld.some((j) => j.name === 'Search: </title><script>alert(1)</script>'), 'JSON-LD decodes to the original text');
  });

  test('?tag= payload is inert', async () => {
    const env = await mkEnv();
    const html = await list(env, 'tag=' + encodeURIComponent('<img src=x onerror=alert(2)>'));
    assert.ok(!html.includes('<img src=x onerror'), 'raw img payload present');
    assert.match(html, /<h1[^>]*>Tag: &lt;img src=x onerror=alert\(2\)&gt;<\/h1>/);
  });

  test('normal searches still render normally', async () => {
    const env = await mkEnv();
    const html = await list(env, 'q=casino');
    assert.match(html, /<title>Search: casino \|/);
    assert.match(html, /<h1[^>]*>Search: casino<\/h1>/);
  });
});

describe('stored payloads in article fields', () => {
  const PAYLOADS = ['</script><script>alert(1)</script>', '</title><script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>'];
  for (const payload of PAYLOADS) {
    test(`title payload is inert everywhere: ${payload.slice(0, 28)}`, async () => {
      const env = await mkEnv();
      await env.DB.prepare(`UPDATE news SET title=?, excerpt=? WHERE id=10`).bind(payload + 'T', 'ex').run();
      const html = await article(env);
      for (const bad of ['<script>alert(1)', '<img src=x onerror', '<svg onload', '</title><script>']) assert.ok(!html.includes(bad), `found: ${bad}`);
      const ld = jsonLdBlocks(html);                                  // every JSON-LD block still parses
      assert.equal(ld.find((j) => j['@type'] === 'NewsArticle').headline, payload + 'T', 'JSON-LD value is preserved exactly');
      assert.equal(ld.find((j) => j['@type'] === 'BreadcrumbList').itemListElement.at(-1).name, payload + 'T');
    });
  }

  test('breadcrumb label is escaped in the visible nav', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`UPDATE news SET title=? WHERE id=10`).bind('A & B <i>x</i>').run();
    const html = await article(env);
    assert.match(html, /<li aria-current="page">A &amp; B &lt;i&gt;x&lt;\/i&gt;<\/li>/);
  });

  test('benign titles keep rendering the same (ampersand / apostrophe)', async () => {
    const env = await mkEnv();
    await env.DB.prepare(`UPDATE news SET title=? WHERE id=10`).bind("Tom & Jerry's Guide").run();
    const html = await article(env);
    assert.match(html, /<title>Tom &amp; Jerry's Guide/);
    assert.equal(jsonLdBlocks(html).find((j) => j['@type'] === 'NewsArticle').headline, "Tom & Jerry's Guide");
  });
});
