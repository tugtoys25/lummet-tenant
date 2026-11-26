// test/news-polish.test.js -- reading time, section names on cards, menu on every news page, menu script/CSS, country filter in the commerce picker.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderNews, renderNewsList } from '../worker/controllers.js';
import { readingMinutes, attachSectionNames, renderArticleCard } from '../worker/newsroom-render.js';
import { pickArticles } from '../worker/newsroom-links.js';
import * as nr from '../worker/database/newsroom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name) VALUES (1,'elie','Elie')`).run();
  await db.prepare(`INSERT OR REPLACE INTO countries (code,name) VALUES ('RW','Rwanda'),('KE','Kenya')`).run();
  await db.prepare(`INSERT INTO news_sections (id,slug,name,active,display_order) VALUES (777,'polish-sec','Polish Sec',1,1)`).run();
  return { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
}
const on = async (env, ...keys) => { await env.DB.prepare(`UPDATE system_settings SET value='true' WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).run(); nr.resetNewsFlagCache(); };
let seq = 1500;
const article = async (env, o = {}) => {
  const id = ++seq;
  await env.DB.prepare(`INSERT INTO news (id,slug,title,content,published,published_at,created_at,author_id,created_by,excerpt,section_id,primary_country) VALUES (?,?,?,?,1,'2026-11-20 10:00:00','2026-11-20 10:00:00',1,1,'ex',?,?)`)
    .bind(id, `p-${id}`, o.title || `Title ${id}`, o.content || '<p>body</p>', o.section ?? null, o.country ?? null).run();
  return id;
};

describe('reading time', () => {
  test('about 220 words a minute, never below 1, ignores markup, scripts and styles', () => {
    assert.equal(readingMinutes(''), 1);
    assert.equal(readingMinutes('<p>' + 'word '.repeat(220) + '</p>'), 1);
    assert.equal(readingMinutes('<p>' + 'word '.repeat(660) + '</p>'), 3);
    assert.equal(readingMinutes('<script>' + 'x '.repeat(5000) + '</script><p>short</p>'), 1);
  });
  test('shown on the article only when news_reading_time is on', async () => {
    const env = await mkEnv(); const id = await article(env, { content: '<p>' + 'word '.repeat(700) + '</p>' });
    const slug = `p-${id}`; const get = async () => (await renderNews(new Request(`https://site.test/en/news/${slug}`), env, slug, null)).text();
    assert.ok(!/min read/.test(await get()), 'off by default');
    await on(env, 'news_reading_time');
    assert.match(await get(), /<span class="news-reading-time">3 min read<\/span>/);
  });
});

describe('section name on cards', () => {
  test('attachSectionNames fills section_name in one pass and card shows it', async () => {
    const env = await mkEnv(); const rows = [{ id: 1, slug: 'a', title: 'A', section_id: 777 }, { id: 2, slug: 'b', title: 'B', section_id: null }];
    await attachSectionNames(env.DB, rows);
    assert.equal(rows[0].section_name, 'Polish Sec'); assert.equal(rows[1].section_name, undefined);
    assert.match(renderArticleCard(rows[0]), /<span class="nr-card__section">Polish Sec<\/span>/);
    assert.ok(!/nr-card__section/.test(renderArticleCard(rows[1])), 'no section, no label');
  });
  test('attachSectionNames never throws on a broken db', async () => {
    const rows = [{ section_id: 777 }]; await attachSectionNames({ prepare() { throw new Error('boom'); } }, rows); assert.equal(rows[0].section_name, undefined);
  });
});

describe('menu on every news page (news_menu_everywhere)', () => {
  test('off: article and section pages carry no menu; on (with taxonomy): both do', async () => {
    const env = await mkEnv(); const id = await article(env, { section: 777 }); await article(env, { section: 777 });
    const art = async () => (await renderNews(new Request(`https://site.test/en/news/p-${id}`), env, `p-${id}`, null)).text();
    const sec = async () => (await renderNews(new Request('https://site.test/en/news/polish-sec'), env, 'polish-sec', null)).text();
    assert.ok(!/nr-nav/.test(await art()) && !/nr-nav/.test(await sec()));
    await on(env, 'news_new_taxonomy', 'news_menu_everywhere');
    assert.match(await art(), /class="nr-nav"/); assert.match(await sec(), /class="nr-nav"/);
  });
  test('flag without taxonomy or search v2 shows nothing', async () => {
    const env = await mkEnv(); const id = await article(env, { section: 777 }); await on(env, 'news_menu_everywhere');
    assert.ok(!/nr-nav/.test(await (await renderNews(new Request(`https://site.test/en/news/p-${id}`), env, `p-${id}`, null)).text()));
  });
});

describe('commerce picker country filter', () => {
  test('matches the primary country or an extra tagged country, rejects bad codes', async () => {
    const env = await mkEnv(); const a = await article(env, { country: 'RW' }); const b = await article(env, { country: 'KE' }); const c = await article(env);
    await env.DB.prepare(`INSERT INTO news_article_countries (news_id,country_code) VALUES (?,?)`).bind(c, 'RW').run();
    const ids = async (country) => (await pickArticles(env.DB, { country })).map((r) => r.id).sort();
    assert.deepEqual(await ids('rw'), [a, c].sort());
    assert.deepEqual(await ids('KE'), [b]);
    assert.equal((await ids("RW' OR 1=1")).length, 3, 'an invalid code is ignored, never injected');
  });
});

describe('menu script and theme variables', () => {
  test('app.js has the outside-tap / Escape / filter behaviour; the css exposes variables with the old colours as defaults', () => {
    const js = readFileSync(join(ROOT, 'static/js/app.js'), 'utf8');
    assert.match(js, /nr-nav__filter/); assert.match(js, /key !== "Escape"/);
    const css = readFileSync(join(ROOT, 'static/css/newsroom.css'), 'utf8');
    assert.match(css, /\.nr-nav\{--nr-ink:#0f172a;/); assert.match(css, /background:var\(--nr-ink,#0f172a\)/);
  });
});
