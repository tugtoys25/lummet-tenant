// test/newsroom-authors-discovery.test.js -- Stage I: author profiles + article discovery links.
// Real controllers/templates/schema (SQLite). Not covered: browsers, real D1 latency.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderAuthor, renderNews } from '../worker/controllers.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';
import * as nr from '../worker/database/newsroom.js';
import * as R from '../worker/newsroom-render.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString().slice(0, 19).replace('T', ' ');

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT INTO users (id,email,password_hash,role) VALUES (1,'a@t.l','x','admin'),(2,'e@t.l','x','editor')`).run();
  await db.prepare(`INSERT INTO authors (id,slug,name,bio,role,email,published) VALUES (1,'jane-doe','Jane Doe','Covers regulation.','Editor','private@example.com',1)`).run();
  await db.prepare(`INSERT INTO countries (code,name) VALUES ('GB','United Kingdom'),('DE','Germany')`).run();
  return { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
}
let seq = 900;
const art = async (env, o = {}) => {
  const id = o.id ?? ++seq;
  await env.DB.prepare(`INSERT INTO news (id,slug,title,content,published,published_at,created_at,author_id,created_by,excerpt,primary_country,region_slug,section_id,article_type) VALUES (?,?,?,?,?,?,?,?,1,'ex',?,?,?,?)`)
    .bind(id, o.slug ?? `a-${id}`, o.title ?? `Title ${id}`, '<p>Body.</p>', o.published ?? 1, o.published_at ?? null, o.created_at ?? ago(o.age ?? 5), o.author ?? 1, o.country ?? null, o.region ?? null, o.section ?? null, o.type ?? null).run();
  return id;
};
const on = async (env, ...keys) => { await env.DB.prepare(`UPDATE system_settings SET value='true' WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).run(); nr.resetNewsFlagCache(); nr.resetCountryCache(); };
const author = async (env, slug = 'jane-doe') => { const r = await renderAuthor(new Request(`https://site.test/en/author/${slug}`), env, slug); return { status: r.status, html: await r.text() }; };
const article = async (env, slug) => (await renderNews(new Request(`https://site.test/en/news/${slug}`), env, slug, null)).text();
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const vis = (html) => { const a = html.indexOf('<article class="news-detail"'); return html.slice(a, html.indexOf('</article>', a)); };
const profile = (env, o) => env.DB.prepare(`UPDATE authors SET job_title=?, expertise=?, location=?, website_url=? WHERE id=1`).bind(o.job_title ?? null, o.expertise ?? null, o.location ?? null, o.website_url ?? null).run();

describe('author page: always-on fixes to existing behaviour', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });

  test('scheduled and draft articles are not listed or counted publicly', async () => {
    await art(env, { title: 'Live One' }); await art(env, { title: 'SCHEDULED SECRET', published_at: '2099-01-01 00:00:00' }); await art(env, { title: 'DRAFT SECRET', published: 0 });
    const { html } = await author(env);
    assert.ok(html.includes('Live One'));
    assert.ok(!html.includes('SCHEDULED SECRET') && !html.includes('DRAFT SECRET'));
    assert.match(html, /<div class="stat-value">1<\/div>\s*<div class="stat-label">Articles<\/div>/);
  });

  test('an unpublished author profile is not served (the list already hides it); published ones are unaffected', async () => {
    assert.equal((await author(env)).status, 200);
    await env.DB.prepare(`UPDATE authors SET published=0 WHERE id=1`).run();
    assert.equal((await author(env)).status, 404);
  });

  test('profile text, review cards and social links cannot inject markup', async () => {
    await env.DB.prepare(`UPDATE authors SET name=?, bio=?, role=?, avatar_url=?, social_links=? WHERE id=1`)
      .bind('<img src=x onerror=alert(1)>', '"><svg onload=alert(2)> {{site_name}}', '<b>Boss</b>', 'x" onerror="alert(3)', '<a href="https://x.example/u" onclick="evil()">X</a><script>alert(4)</script><a href="javascript:alert(5)">j</a>').run();
    await env.DB.prepare(`INSERT INTO casinos (slug,name,logo,website_url,affiliate_url) VALUES ('c1','Casino "><i>x</i>','/l.png" onerror="alert(6)','https://c.example','https://c.example/a')`).run();
    await env.DB.prepare(`INSERT INTO reviews (casino_slug,slug,title,content,rating,author_id,published) VALUES ('c1','r1','Review <u>title</u>','x',4,1,1)`).run();
    const { html } = await author(env);
    for (const bad of ['<img src=x onerror', '<svg onload', 'onerror="alert', 'onclick="evil', '<script>alert(4)', 'javascript:alert', '<u>title</u>', '<i>x</i>']) assert.ok(!html.includes(bad), `found ${bad}`);
    assert.ok(html.includes('&#123;&#123;site_name&#125;&#125;') || !html.includes('{{site_name}}'), 'template braces not expanded inside the bio');
    assert.match(html, /href="https:\/\/x\.example\/u"/, 'legitimate social link survives sanitising');
    ld(html);                                                                     // JSON-LD still valid
  });
});

describe('author page: newsroom profile (flag news_new_taxonomy)', () => {
  let env; beforeEach(async () => { env = await mkEnv(); await profile(env, { job_title: 'Senior Correspondent', expertise: 'Regulation, Payments', location: 'Valletta, Malta', website_url: 'https://jane.example/about' }); await art(env); await art(env); });

  test('flag off: existing page and legacy Person schema; new fields are not shown', async () => {
    const { html } = await author(env);
    assert.ok(!html.includes('nr-author-facts') && !html.includes('Senior Correspondent') && !html.includes('newsroom.css'));
    const p = ld(html).find((j) => j['@type'] === 'Person');
    assert.equal(p.jobTitle, 'Editor'); assert.ok(!('worksFor' in p) && !('knowsAbout' in p));
  });

  test('flag on: facts block and enriched Person schema; live article count; website is a safe link', async () => {
    await on(env, 'news_new_taxonomy');
    await art(env, { title: 'Hidden', published: 0 });
    const { html } = await author(env);
    assert.match(html, /<dl class="nr-author-facts">/);
    assert.match(html, /<dt>Role<\/dt><dd>Senior Correspondent<\/dd>/);
    assert.match(html, /<dt>Expertise<\/dt><dd>Regulation, Payments<\/dd>/);
    assert.match(html, /<dt>Based in<\/dt><dd>Valletta, Malta<\/dd>/);
    assert.match(html, /<a href="https:\/\/jane\.example\/about" rel="me noopener noreferrer">jane\.example<\/a>/);
    assert.match(html, /<dt>Articles<\/dt><dd>2<\/dd>/);
    assert.match(html, /<p class="author-profile-role">\s*Senior Correspondent\s*<\/p>/);
    const p = ld(html).find((j) => j['@type'] === 'Person');
    assert.equal(p.jobTitle, 'Senior Correspondent'); assert.deepEqual(p.knowsAbout, ['Regulation', 'Payments']);
    assert.deepEqual(p.workLocation, { '@type': 'Place', name: 'Valletta, Malta' }); assert.deepEqual(p.sameAs, ['https://jane.example/about']);
    assert.equal(p.worksFor['@type'], 'NewsMediaOrganization'); assert.equal(p.url, 'https://site.test/en/author/jane-doe');
    assert.ok(p.worksFor.name && p.worksFor.name !== 'Level.casino', 'publication identity comes from site settings / host, never a hardcoded brand');
  });

  test('flag on: hostile website/expertise values are inert; empty fields are simply omitted', async () => {
    await on(env, 'news_new_taxonomy');
    await profile(env, { job_title: null, expertise: '<script>alert(1)</script>, {{title}}', location: null, website_url: 'javascript:alert(1)' });
    const { html } = await author(env);
    assert.ok(!html.includes('javascript:') && !html.includes('<script>alert(1)</script>'));
    assert.ok(!html.includes('<dt>Website') && !html.includes('<dt>Based in') && !html.includes('<dt>Role'));
    ld(html);
    await profile(env, {});
    assert.match((await author(env)).html, /<dl class="nr-author-facts"><div><dt>Articles<\/dt><dd>2<\/dd><\/div><\/dl>/);
  });

  test('the byline on an article shows the job title when the flag is on, the role otherwise', async () => {
    const id = await art(env, { slug: 'by-jane' });
    assert.match(vis(await article(env, 'by-jane')), /display:block">Editor<\/span>/);
    await on(env, 'news_new_taxonomy');
    assert.match(vis(await article(env, 'by-jane')), /display:block">Senior Correspondent<\/span>/);
  });
});

describe('article discovery (flag news_new_taxonomy)', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });
  const sectionId = async () => (await env.DB.prepare(`SELECT id FROM news_sections WHERE slug='regulation'`).first()).id;

  test('flag off: nothing is added', async () => {
    const id = await art(env, { slug: 'x', country: 'GB', region: 'europe' });
    await env.DB.prepare(`INSERT INTO news_topics (id,slug,name) VALUES (1,'licensing','Licensing')`).run(); await env.DB.prepare(`INSERT INTO news_article_topics (news_id,topic_id) VALUES (?,1)`).bind(id).run();
    const html = vis(await article(env, 'x'));
    assert.ok(!html.includes('nr-discovery') && !html.includes('nr-series-nav') && !html.includes('nr-more'));
  });

  test('chips: region, countries (canonical slugs, published only), topics (active), entities only with entity pages on', async () => {
    await on(env, 'news_new_taxonomy');
    const id = await art(env, { slug: 'x', country: 'GB', region: 'europe' });
    await env.DB.prepare(`INSERT INTO news_article_countries (news_id,country_code) VALUES (?, 'DE'), (?, 'GB')`).bind(id, id).run();
    await env.DB.prepare(`INSERT INTO news_topics (id,slug,name,active) VALUES (1,'licensing','Licensing',1),(2,'old','Retired',0)`).run();
    await env.DB.prepare(`INSERT INTO news_article_topics (news_id,topic_id) VALUES (?,1),(?,2)`).bind(id, id).run();
    await env.DB.prepare(`INSERT INTO news_entities (id,slug,name) VALUES (1,'ukgc','UK Gambling Commission')`).run(); await env.DB.prepare(`INSERT INTO news_article_entities (news_id,entity_id) VALUES (?,1)`).bind(id).run();
    let html = vis(await article(env, 'x'));
    assert.match(html, /<nav class="nr-discovery" aria-label="Explore related coverage">/);
    assert.match(html, /Region and countries:<\/span> <a href="\/en\/news\/europe">Europe<\/a> · <a href="\/en\/news\/united-kingdom">United Kingdom<\/a> · <a href="\/en\/news\/germany">Germany<\/a>/);
    assert.match(html, /Topics:<\/span> <a href="\/en\/news\/topic\/licensing">Licensing<\/a>/);
    assert.ok(!html.includes('Retired') && !html.includes('UK Gambling Commission'), 'inactive topic and entity (pages off) are not linked');
    await on(env, 'news_entity_pages');
    html = vis(await article(env, 'x'));
    assert.match(html, /Companies and people:<\/span> <a href="\/en\/news\/entity\/ukgc">UK Gambling Commission<\/a>/);
    await env.DB.prepare(`UPDATE countries SET published=0 WHERE code='DE'`).run(); nr.resetCountryCache();
    assert.ok(!vis(await article(env, 'x')).includes('Germany'), 'an unpublished country page is never linked');
  });

  test('series navigation: Part N of M with previous/next among LIVE articles only', async () => {
    await on(env, 'news_new_taxonomy');
    await env.DB.prepare(`INSERT INTO news_series (id,slug,name) VALUES (1,'eu-reg','EU Regulation')`).run();
    const p1 = await art(env, { slug: 'p1', title: 'One' }), p2 = await art(env, { slug: 'p2', title: 'Two' }), pd = await art(env, { slug: 'pd', title: 'Draft Part', published: 0 }), p3 = await art(env, { slug: 'p3', title: 'Three' });
    for (const [pos, id] of [[1, p1], [2, pd], [3, p2], [4, p3]]) await env.DB.prepare(`INSERT INTO news_series_articles (series_id,news_id,position) VALUES (1,?,?)`).bind(id, pos).run();
    const html = vis(await article(env, 'p2'));
    assert.match(html, /<strong>Part 2 of 3<\/strong> in the series <a href="\/en\/news\/series\/eu-reg">EU Regulation<\/a>/);
    assert.match(html, /Previous<\/span> <a href="\/en\/news\/p1" rel="prev">One<\/a>/);
    assert.match(html, /Next<\/span> <a href="\/en\/news\/p3" rel="next">Three<\/a>/);
    assert.ok(!html.includes('Draft Part'));
    const first = vis(await article(env, 'p1'));
    assert.match(first, /Part 1 of 3/); assert.ok(!first.includes('rel="prev"'));
  });

  test('more from section: up to 4 latest live stories in the same section, excluding this one, drafts and scheduled', async () => {
    await on(env, 'news_new_taxonomy'); const s = await sectionId();
    const me = await art(env, { slug: 'me', title: 'Me', section: s, age: 1 });
    for (let i = 0; i < 5; i++) await art(env, { title: `Sibling ${i}`, section: s, age: 10 + i });
    await art(env, { title: 'HIDDEN DRAFT', section: s, published: 0 }); await art(env, { title: 'HIDDEN SCHEDULED', section: s, published_at: '2099-01-01 00:00:00' });
    await art(env, { title: 'Other Section', section: (await env.DB.prepare(`SELECT id FROM news_sections WHERE slug='markets'`).first()).id });
    const html = vis(await article(env, 'me'));
    assert.match(html, /<h2 id="nr-more-h">More from <a href="\/en\/news\/regulation">Regulation<\/a><\/h2>/);
    const block = [...html.matchAll(/<section class="nr-more"[\s\S]*?<\/section>/g)][0][0];
    assert.equal(block.match(/<li>/g).length, 4);
    for (const bad of ['HIDDEN', 'Other Section', '>Me<']) assert.ok(!block.includes(bad), bad);
  });

  test('nothing renders for an article with no relations (no empty shells); output is escaped', async () => {
    await on(env, 'news_new_taxonomy');
    await art(env, { slug: 'plain' });
    assert.ok(!/nr-discovery|nr-series-nav|nr-more/.test(vis(await article(env, 'plain'))));
    await env.DB.prepare(`INSERT INTO news_topics (id,slug,name) VALUES (1,'t','<img src=x onerror=alert(1)> {{title}}')`).run();
    const id = await art(env, { slug: 'evil' }); await env.DB.prepare(`INSERT INTO news_article_topics (news_id,topic_id) VALUES (?,1)`).bind(id).run();
    const html = vis(await article(env, 'evil'));
    assert.ok(!html.includes('<img src=x onerror') && !html.includes('{{title}}'));
  });

  test('cost: discovery adds at most 2 queries beyond its base union query', async () => {
    await on(env, 'news_new_taxonomy'); const s = await sectionId();
    const plain = await art(env, { slug: 'plain2' }), rich = await art(env, { slug: 'rich2', section: s });
    await env.DB.prepare(`INSERT INTO news_series (id,slug,name) VALUES (1,'s','S')`).run(); await env.DB.prepare(`INSERT INTO news_series_articles (series_id,news_id,position) VALUES (1,?,1)`).bind(rich).run();
    const count = async (slug) => { let n = 0; const db = new Proxy(env.DB, { get: (t, k) => (k === 'prepare' ? (sql) => { n++; return t.prepare(sql); } : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) }); nr.resetNewsFlagCache(); await renderNews(new Request('https://site.test/en/news/' + slug), { ...env, DB: db }, slug, null); return n; };
    await count('plain2');                                    // warm caches
    const [a, b] = [await count('plain2'), await count('rich2')];
    assert.ok(b - a <= 3, `rich article used ${b - a} more queries than a plain one (section lookup + series neighbours + more-from-section)`);
  });
});

describe('authors admin API', () => {
  let env; beforeEach(async () => { env = await mkEnv(); });
  const call = async (method, route, user, body) => { const init = { method, headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {} }; if (body) init.body = JSON.stringify(body); const r = await handleNewsroomApi(new Request(`https://site.test/api/v1/newsroom/${route}`, init), env, user); return { status: r.status, json: await r.json() }; };
  test('list needs news.manage_authors and never returns private columns', async () => {
    assert.equal((await call('GET', 'authors/list', { user_id: 2, role: 'editor' })).status, 403);
    const l = await call('GET', 'authors/list', { user_id: 1, role: 'admin' });
    assert.equal(l.status, 200); assert.equal(l.json.authors[0].slug, 'jane-doe');
    assert.ok(!JSON.stringify(l.json).includes('private@example.com') && !('email' in l.json.authors[0]));
  });
});

describe('render helpers', () => {
  test('renderAuthorFacts / renderDiscovery / renderSeriesNav return "" when there is nothing to show', () => {
    assert.equal(R.renderAuthorFacts({}, undefined), ''); assert.equal(R.renderDiscovery(null), ''); assert.equal(R.renderDiscovery({ topics: [], entities: [], countries: [], region: null }), '');
    assert.equal(R.renderSeriesNav(null), ''); assert.equal(R.renderMoreFromSection([], { slug: 's', name: 'S' }), ''); assert.equal(R.renderMoreFromSection([{ slug: 'a', title: 'A' }], null), '');
  });
});
