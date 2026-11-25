// test/newsroom-nav.test.js -- the News home menu (sections + topics) under the search box.
// Real migrated schema and the real controller/template. Not covered: browsers/CSS.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderNewsList } from '../worker/controllers.js';
import { renderNewsNav } from '../worker/newsroom-home.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name) VALUES (1,'elie','Elie')`).run();
  return { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
}
const flags = (env, keys) => env.DB.prepare(`UPDATE system_settings SET value='true' WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).run();
const section = async (env, slug, name, { active = 1, parent = null, order = 0 } = {}) =>
  (await env.DB.prepare(`INSERT INTO news_sections (slug,name,active,parent_id,display_order) VALUES (?,?,?,?,?)`).bind(slug, name, active, parent, order).run()).meta.last_row_id;
let seq = 500;
const article = async (env, { sectionId = null, published = 1, topicIds = [] } = {}) => {
  const id = ++seq;
  await env.DB.prepare(`INSERT INTO news (id,slug,title,content,published,created_at,author_id,created_by,excerpt,section_id) VALUES (?,?,?,?,?,datetime('now','-1 hour'),1,1,'ex',?)`)
    .bind(id, `a-${id}`, `Title ${id}`, '<p>x</p>', published, sectionId).run();
  for (const t of topicIds) await env.DB.prepare(`INSERT INTO news_article_topics (news_id,topic_id) VALUES (?,?)`).bind(id, t).run();
  return id;
};
const topic = async (env, slug, name, active = 1) =>
  (await env.DB.prepare(`INSERT INTO news_topics (slug,name,active) VALUES (?,?,?)`).bind(slug, name, active).run()).meta.last_row_id;
const home = async (env) => { const r = await renderNewsList(new Request('https://site.test/en/news'), env); return { status: r.status, html: await r.text() }; };

describe('News home menu', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });
  const navOf = (html) => { const a = html.indexOf('class="nr-nav"'); return a < 0 ? '' : html.slice(a, html.indexOf('</nav>', a)); };

  test('Sections and Topics dropdowns list only active entries that have published articles, with counts', async () => {
    await flags(env, ['news_v2_homepage', 'news_new_taxonomy']);
    const reviews = await section(env, 'reviews', 'Reviews', { order: 1 });
    await section(env, 'empty-section', 'Empty Section');
    const off = await section(env, 'hidden-section', 'Hidden Section', { active: 0 });
    const t1 = await topic(env, 'wearables', 'Wearables'), t2 = await topic(env, 'no-articles', 'No Articles Topic');
    await topic(env, 'off-topic', 'Off Topic', 0);
    await article(env, { sectionId: reviews, topicIds: [t1] });
    await article(env, { sectionId: reviews });
    await article(env, { sectionId: off });
    await article(env, { sectionId: reviews, published: 0, topicIds: [t2] });
    const { status, html } = await home(env);
    assert.equal(status, 200);
    const nav = navOf(html);
    assert.match(nav, /<summary>Sections<\/summary>/);
    assert.match(nav, /<summary>Topics<\/summary>/);
    assert.match(nav, /href="\/en\/news\/reviews"><span>Reviews<\/span><small>2<\/small>/);
    assert.match(nav, /href="\/en\/news\/topic\/wearables"><span>Wearables<\/span><small>1<\/small>/);
    for (const gone of ['Empty Section', 'Hidden Section', 'No Articles Topic', 'Off Topic']) assert.ok(!nav.includes(gone), `${gone} must not be in the menu`);
  });

  test('a parent section shows when only its child has articles; the child follows it', async () => {
    await flags(env, ['news_v2_homepage', 'news_new_taxonomy']);
    const parent = await section(env, 'guides', 'Guides');
    const child = await section(env, 'phone-guides', 'Phone Guides', { parent });
    await article(env, { sectionId: child });
    const nav = navOf((await home(env)).html);
    assert.ok(nav.indexOf('<span>Guides</span>') > -1 && nav.indexOf('<span>Phone Guides</span>') > nav.indexOf('<span>Guides</span>'));
    assert.match(nav, /<li class="nr-nav__child">/);
  });

  test('inline chips are the busiest entries (max 4), a name in both lists shows once, and long names carry a title', async () => {
    await flags(env, ['news_v2_homepage', 'news_new_taxonomy']);
    const big = await section(env, 'big', 'Biggest Section'); const twin = await section(env, 'twin', 'Twin');
    const tTwin = await topic(env, 'twin-topic', 'Twin'); const long = 'A very long topic name that would never fit on one line of a phone';
    const tLong = await topic(env, 'long-topic', long);
    for (let i = 0; i < 5; i++) await article(env, { sectionId: big });
    for (let i = 0; i < 3; i++) await article(env, { sectionId: twin, topicIds: [tTwin, tLong] });
    for (let i = 0; i < 6; i++) { const t = await topic(env, `filler-${i}`, `Filler ${i}`); await article(env, { topicIds: [t] }); }
    const nav = navOf((await home(env)).html);
    const trend = nav.slice(nav.indexOf('class="nr-nav__trend"'));
    assert.equal((trend.match(/<li>/g) || []).length, 4);
    assert.match(trend, /Biggest Section/);
    assert.equal((trend.match(/>Twin</g) || []).length, 1, 'duplicate name once');
    assert.match(trend, new RegExp(`title="${long}"`));
  });

  test('Regions and Countries dropdowns list only active regions / published countries that have articles', async () => {
    await flags(env, ['news_v2_homepage', 'news_new_taxonomy']);
    const run = (sql, ...a) => env.DB.prepare(sql).bind(...a).run();
    await run(`INSERT OR REPLACE INTO countries (code,name,published) VALUES ('RW','Rwanda',1),('KE','Kenya',1),('ZZ','Hidden Land',0),('UG','Uganda',1)`);
    await run(`INSERT INTO news_regions (slug,name,active) VALUES ('east-africa','East Africa',1),('empty-region','Empty Region',1),('off-region','Off Region',0)`);
    await run(`INSERT INTO news_region_countries (region_slug,country_code) VALUES ('east-africa','RW'),('east-africa','KE'),('off-region','RW'),('empty-region','UG')`);
    const a = await article(env), b = await article(env), c = await article(env), d = await article(env, { published: 0 });
    await run(`UPDATE news SET primary_country='RW' WHERE id=?`, a);
    await run(`UPDATE news SET primary_country='RW' WHERE id=?`, b);
    await run(`INSERT INTO news_article_countries (news_id,country_code) VALUES (?,?),(?,?)`, b, 'KE', c, 'ZZ');
    await run(`UPDATE news SET primary_country='UG' WHERE id=?`, d);   // draft: must not count
    const nav = navOf((await home(env)).html);
    assert.match(nav, /<summary>Regions<\/summary>/);
    assert.match(nav, /<summary>Countries<\/summary>/);
    assert.match(nav, /href="\/en\/news\/east-africa"><span>East Africa<\/span><small>2<\/small>/, 'region counts each article once');
    assert.match(nav, /<span>Rwanda<\/span><small>2<\/small>/);
    assert.match(nav, /<span>Kenya<\/span><small>1<\/small>/);
    for (const gone of ['Empty Region', 'Off Region', 'Hidden Land', 'Uganda']) assert.ok(!nav.includes(gone), `${gone} must not be in the menu`);
  });

  test('Date & time dropdown (search v2): quick ranges plus calendar and time fields, in a plain GET form', async () => {
    await flags(env, ['news_v2_homepage', 'news_search_v2']);   // no taxonomy flag: the date menu stands alone
    await article(env);
    const nav = navOf((await home(env)).html);
    assert.match(nav, /<summary>Date &amp; time<\/summary>/);
    assert.ok(!nav.includes('<summary>Sections</summary>'), 'section pages are off, so no sections button');
    for (const k of ['today', 'yesterday', '7d', '30d', 'month']) assert.ok(nav.includes(`<a data-nr-tz href="/en/news?range=${k}">`), `preset ${k}`);
    assert.match(nav, /<form class="nr-date-form" method="get" action="\/en\/news">/);
    for (const f of ['day', 'from', 'to', 'from_time', 'to_time', 'tzo']) assert.ok(nav.includes(`name="${f}"`), `field ${f}`);
    assert.match(nav, /<input type="date" name="day">/);
    assert.match(nav, /<input type="time" name="from_time">/);
  });

  test('Date & time is the last dropdown when the taxonomy menu is on too, and is absent without search v2', async () => {
    await flags(env, ['news_v2_homepage', 'news_new_taxonomy', 'news_search_v2']);
    const s = await section(env, 'reviews', 'Reviews'); await article(env, { sectionId: s });
    const nav = navOf((await home(env)).html);
    assert.ok(nav.indexOf('<summary>Sections</summary>') > -1 && nav.indexOf('<summary>Date &amp; time</summary>') > nav.indexOf('<summary>Sections</summary>'));
    const env2 = await mkEnv(); await flags(env2, ['news_v2_homepage', 'news_new_taxonomy']);
    const s2 = await section(env2, 'reviews', 'Reviews'); await article(env2, { sectionId: s2 });
    assert.ok(!navOf((await home(env2)).html).includes('Date &amp; time'));
  });

  test('is absent without the sections flag (those pages would 404) and when nothing qualifies', async () => {
    await flags(env, ['news_v2_homepage']);
    const s = await section(env, 'reviews', 'Reviews'); await article(env, { sectionId: s });
    assert.ok(!(await home(env)).html.includes('class="nr-nav"'));
    const env2 = await mkEnv(); await flags(env2, ['news_v2_homepage', 'news_new_taxonomy']); await article(env2);
    assert.ok(!(await home(env2)).html.includes('class="nr-nav"'));
  });

  test('escapes names and slugs', () => {
    const html = renderNewsNav({ sections: [{ slug: 'a b', name: '<img src=x onerror=1>', count: 1 }], topics: [{ slug: 'x"y', name: '<b>t</b>', count: 1 }],
      popular: [{ kind: 'topic', slug: 'x"y', name: '<b>t</b>' }] });
    assert.ok(!html.includes('<img') && !html.includes('<b>'));
    assert.match(html, /href="\/en\/news\/a%20b"/);
    assert.match(html, /topic\/x%22y"/);
  });
});
